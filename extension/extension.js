// SPDX-FileCopyrightText: 2026 xlr8login contributors
// SPDX-License-Identifier: GPL-2.0-or-later

import AccountsService from 'gi://AccountsService';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as AuthPrompt from 'resource:///org/gnome/shell/gdm/authPrompt.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as UnlockDialog from 'resource:///org/gnome/shell/ui/unlockDialog.js';

/** Pause auto-submit after one failure so a longer password can be typed manually. */
const FAILURE_BACKOFF_LIMIT = 1;
const SUBMIT_DELAY_MS = 75;
/** GDM cannot read ~/.config (home dirs are typically mode 700). */
const SHARED_SETTINGS_DIR = '/var/lib/xlr8login';

export default class Xlr8LoginExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._injectionManager = new InjectionManager();
        this._consecutiveFailures = 0;
        this._submitTimeoutId = 0;
        this._stageId = 0;
        this._signalIds = [];
        this._attached = new WeakSet();
        this._typedLengths = new WeakMap();
        this._overlay = null;
        this._activeUsername = null;

        this._settingsChangedId = this._settings.connect('changed', () => {
            this._consecutiveFailures = 0;
            this._cancelPendingSubmit();
            this._exportUserSettings();
        });

        if (!Main.sessionMode?.isGreeter) {
            this._activeUsername = GLib.get_user_name();
            this._exportUserSettings();
        }

        this._installHooks();
        this._stageId = global.stage.connect('captured-event',
            this._onStageEvent.bind(this));
        this._watchLockScreen();
        this._attachExisting();
    }

    disable() {
        this._cancelPendingSubmit();

        if (this._stageId) {
            global.stage.disconnect(this._stageId);
            this._stageId = 0;
        }

        for (const [obj, id] of this._signalIds) {
            try {
                obj.disconnect(id);
            } catch (_e) {
                // already disconnected
            }
        }
        this._signalIds = [];

        this._injectionManager?.clear();
        this._injectionManager = null;

        if (this._settings && this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }

        this._settings = null;
        this._attached = null;
        this._typedLengths = null;
        this._overlay = null;
        this._activeUsername = null;
        this._consecutiveFailures = 0;
    }

    _installHooks() {
        const self = this;
        const authProto = AuthPrompt.AuthPrompt.prototype;
        const unlockProto = UnlockDialog.UnlockDialog.prototype;

        const wrap = (proto, name, after) => {
            this._injectionManager.overrideMethod(proto, name, original => {
                /* eslint-disable no-invalid-this */
                return function (...args) {
                    const result = original.apply(this, args);
                    after.call(self, this, ...args);
                    return result;
                };
                /* eslint-enable no-invalid-this */
            });
        };

        wrap(authProto, 'setUser', (_prompt, user) => {
            this._activeUsername = user?.get_user_name?.() ?? null;
            this._loadUserOverlay(this._activeUsername);
        });

        wrap(authProto, '_initInputRow', prompt => {
            this._attachToPrompt(prompt);
        });

        this._injectionManager.overrideMethod(authProto, '_onAskQuestion', original => {
            /* eslint-disable no-invalid-this */
            return function (serviceName, question, secret, ...rest) {
                const result = original.call(this, serviceName, question, secret, ...rest);
                if (secret)
                    self._attachToPrompt(this);
                return result;
            };
            /* eslint-enable no-invalid-this */
        });

        for (const name of ['_ensureAuthPrompt', '_showPrompt']) {
            wrap(unlockProto, name, dialog => {
                if (dialog._authPrompt)
                    this._attachToPrompt(dialog._authPrompt);
            });
        }

        this._injectionManager.overrideMethod(authProto, '_onVerificationFailed', original => {
            /* eslint-disable no-invalid-this */
            return function (...args) {
                self._cancelPendingSubmit();
                self._consecutiveFailures += 1;
                self._typedLengths.delete(this);
                return original.apply(this, args);
            };
            /* eslint-enable no-invalid-this */
        });

        this._injectionManager.overrideMethod(authProto, '_onVerificationComplete', original => {
            /* eslint-disable no-invalid-this */
            return function (...args) {
                self._cancelPendingSubmit();
                self._consecutiveFailures = 0;
                self._typedLengths.delete(this);
                return original.apply(this, args);
            };
            /* eslint-enable no-invalid-this */
        });

        this._injectionManager.overrideMethod(authProto, 'clear', original => {
            /* eslint-disable no-invalid-this */
            return function (...args) {
                self._cancelPendingSubmit();
                self._typedLengths.set(this, 0);
                return original.apply(this, args);
            };
            /* eslint-enable no-invalid-this */
        });
    }

    _onStageEvent(_actor, event) {
        if (event.type() !== Clutter.EventType.KEY_PRESS)
            return Clutter.EVENT_PROPAGATE;
        if (!this._isLockContext())
            return Clutter.EVENT_PROPAGATE;

        const prompt = this._findAuthPrompt();
        if (!prompt)
            return Clutter.EVENT_PROPAGATE;

        this._attachToPrompt(prompt);
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._syncLengthFromEntry(prompt);
            this._onPasswordTextChanged(prompt);
            return GLib.SOURCE_REMOVE;
        });
        return Clutter.EVENT_PROPAGATE;
    }

    _sharedSettingsPath(username) {
        return GLib.build_filenamev([SHARED_SETTINGS_DIR, `${username}.json`]);
    }

    _exportUserSettings() {
        if (!this._settings || Main.sessionMode?.isGreeter)
            return;

        const username = GLib.get_user_name();
        const payload = `${JSON.stringify({
            enabled: this._settings.get_boolean('enabled'),
            'auto-submit-length': this._settings.get_int('auto-submit-length'),
            'digits-only': this._settings.get_boolean('digits-only'),
        }, null, 2)}\n`;
        const bytes = new TextEncoder().encode(payload);

        try {
            GLib.mkdir_with_parents(SHARED_SETTINGS_DIR, 0o1777);
            const path = this._sharedSettingsPath(username);
            Gio.File.new_for_path(path).replace_contents(
                bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            GLib.chmod(path, 0o644);
        } catch (e) {
            console.warn(`xlr8login: could not export shared settings: ${e}`);
        }

        try {
            const confDir = GLib.build_filenamev([GLib.get_user_config_dir(), 'xlr8login']);
            GLib.mkdir_with_parents(confDir, 0o755);
            const path = GLib.build_filenamev([confDir, 'settings.json']);
            Gio.File.new_for_path(path).replace_contents(
                bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            GLib.chmod(path, 0o644);
        } catch (_e) {
            // optional mirror
        }
    }

    _loadUserOverlay(username) {
        this._overlay = null;
        if (!username || username === 'gdm')
            return;

        const candidates = [this._sharedSettingsPath(username)];
        try {
            const user = AccountsService.UserManager.get_default().get_user(username);
            const home = user?.get_home_dir?.();
            if (home) {
                candidates.push(GLib.build_filenamev(
                    [home, '.config', 'xlr8login', 'settings.json']));
            }
        } catch (_e) {
            // ignore
        }

        for (const path of candidates) {
            try {
                const file = Gio.File.new_for_path(path);
                if (!file.query_exists(null))
                    continue;
                const [, fileBytes] = file.load_contents(null);
                this._overlay = JSON.parse(new TextDecoder().decode(fileBytes));
                return;
            } catch (_e) {
                // try next candidate
            }
        }
    }

    _useOverlay() {
        return !!Main.sessionMode?.isGreeter && !!this._overlay;
    }

    _isEnabled() {
        if (this._useOverlay() && typeof this._overlay.enabled === 'boolean')
            return this._overlay.enabled;
        return this._settings?.get_boolean('enabled') ?? false;
    }

    _submitLength() {
        if (this._useOverlay() && Number.isInteger(this._overlay['auto-submit-length']))
            return this._overlay['auto-submit-length'];
        return this._settings?.get_int('auto-submit-length') ?? 4;
    }

    _digitsOnly() {
        if (this._useOverlay() && typeof this._overlay['digits-only'] === 'boolean')
            return this._overlay['digits-only'];
        return this._settings?.get_boolean('digits-only') ?? false;
    }

    _connect(obj, signal, cb) {
        if (!obj?.connect)
            return;
        this._signalIds.push([obj, obj.connect(signal, cb)]);
    }

    _watchLockScreen() {
        const shield = Main.screenShield;
        if (!shield)
            return;
        this._connect(shield, 'lock-screen-shown', () => this._attachExisting());
        this._connect(shield, 'locked-changed', () => this._attachExisting());
        this._connect(shield, 'active-changed', () => this._attachExisting());
    }

    _isLockContext() {
        const mode = Main.sessionMode;
        if (mode?.currentMode === 'unlock-dialog' || mode?.isGreeter)
            return true;
        return !!(Main.screenShield?.locked || Main.screenShield?.active);
    }

    _findAuthPrompt() {
        return Main.screenShield?._dialog?._authPrompt
            ?? Main.screenShield?.unlockDialog?._authPrompt
            ?? null;
    }

    _attachExisting() {
        const prompt = this._findAuthPrompt();
        if (prompt)
            this._attachToPrompt(prompt);
    }

    _cancelPendingSubmit() {
        if (this._submitTimeoutId) {
            GLib.source_remove(this._submitTimeoutId);
            this._submitTimeoutId = 0;
        }
    }

    _passwordText(prompt) {
        const entry = prompt?._entry ?? prompt?._passwordEntry;
        if (!entry)
            return '';
        if (entry.text != null)
            return String(entry.text);
        const clutterText = entry.clutter_text ?? entry.clutterText;
        if (clutterText?.text != null)
            return String(clutterText.text);
        if (typeof clutterText?.get_text === 'function')
            return clutterText.get_text() ?? '';
        if (typeof entry.get_text === 'function')
            return entry.get_text() ?? '';
        return '';
    }

    _syncLengthFromEntry(prompt) {
        const readLen = this._passwordText(prompt).length;
        if (readLen > 0)
            this._typedLengths.set(prompt, readLen);
    }

    _currentLength(prompt) {
        return Math.max(
            this._passwordText(prompt).length,
            this._typedLengths?.get(prompt) ?? 0);
    }

    _attachToPrompt(prompt) {
        if (!prompt?._passwordEntry || !this._attached)
            return;

        if (this._attached.has(prompt)) {
            this._onPasswordTextChanged(prompt);
            return;
        }

        this._attached.add(prompt);
        this._typedLengths.set(prompt, this._passwordText(prompt).length);

        const clutterText = prompt._passwordEntry.clutter_text
            ?? prompt._passwordEntry.clutterText;
        if (!clutterText)
            return;

        const scheduleCheck = () => {
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._syncLengthFromEntry(prompt);
                this._onPasswordTextChanged(prompt);
                return GLib.SOURCE_REMOVE;
            });
        };

        clutterText.connect('insert-text', (actor, text, _length) => {
            if (this._digitsOnly() && !/^\d*$/.test(text)) {
                GObject.signal_stop_emission_by_name(actor, 'insert-text');
                return;
            }
            const next = (this._typedLengths.get(prompt) ?? 0) + String(text).length;
            this._typedLengths.set(prompt, next);
            scheduleCheck();
        });

        clutterText.connect('delete-text', (_actor, start, end) => {
            const cur = this._typedLengths.get(prompt) ?? 0;
            this._typedLengths.set(prompt, Math.max(0, cur - Math.max(0, end - start)));
            scheduleCheck();
        });

        clutterText.connect('text-changed', () => {
            this._syncLengthFromEntry(prompt);
            this._onPasswordTextChanged(prompt);
        });

        prompt.connect('destroy', () => this._cancelPendingSubmit());
        this._onPasswordTextChanged(prompt);
    }

    _onPasswordTextChanged(prompt) {
        if (!this._isEnabled())
            return;
        if (this._consecutiveFailures >= FAILURE_BACKOFF_LIMIT)
            return;
        if (prompt._entry && prompt._passwordEntry &&
            prompt._entry !== prompt._passwordEntry)
            return;

        // VERIFYING means the password prompt is active — do not skip it.
        if (prompt.verificationStatus === AuthPrompt.AuthPromptStatus.VERIFICATION_IN_PROGRESS ||
            prompt.verificationStatus === AuthPrompt.AuthPromptStatus.VERIFICATION_SUCCEEDED)
            return;

        if (Main.sessionMode?.isGreeter) {
            if (!this._activeUsername)
                return;
            if (!this._overlay)
                this._loadUserOverlay(this._activeUsername);
        }

        const need = this._submitLength();
        const len = this._currentLength(prompt);
        if (len !== need) {
            this._cancelPendingSubmit();
            return;
        }

        this._cancelPendingSubmit();
        this._submitTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SUBMIT_DELAY_MS, () => {
            this._submitTimeoutId = 0;
            this._trySubmit(prompt, need);
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._submitTimeoutId, '[xlr8login] auto-submit');
    }

    _trySubmit(prompt, expectedLength) {
        if (!this._isEnabled())
            return;
        if (this._consecutiveFailures >= FAILURE_BACKOFF_LIMIT)
            return;
        if (prompt._entry && prompt._passwordEntry &&
            prompt._entry !== prompt._passwordEntry)
            return;
        if (prompt._passwordEntry && !prompt._passwordEntry.reactive)
            return;
        if (this._currentLength(prompt) !== expectedLength)
            return;
        if (prompt.verificationStatus === AuthPrompt.AuthPromptStatus.VERIFICATION_IN_PROGRESS ||
            prompt.verificationStatus === AuthPrompt.AuthPromptStatus.VERIFICATION_SUCCEEDED)
            return;

        if (typeof prompt._activateNext === 'function')
            prompt._activateNext(true);
        else
            prompt._passwordEntry?.clutter_text?.emit('activate');
    }
}
