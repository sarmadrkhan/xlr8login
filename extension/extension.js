// SPDX-FileCopyrightText: 2026 xlr8login contributors
// SPDX-License-Identifier: GPL-2.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as AuthPrompt from 'resource:///org/gnome/shell/gdm/authPrompt.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const FAILURE_BACKOFF_LIMIT = 3;
const SUBMIT_DELAY_MS = 75;

export default class Xlr8LoginExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._injectionManager = new InjectionManager();
        this._consecutiveFailures = 0;
        this._submitTimeoutId = 0;
        this._attached = new WeakSet();

        this._settingsChangedId = this._settings.connect('changed', () => {
            this._consecutiveFailures = 0;
            this._cancelPendingSubmit();
        });

        const proto = AuthPrompt.AuthPrompt.prototype;
        const self = this;

        this._injectionManager.overrideMethod(proto, '_initInputRow', originalMethod => {
            /* eslint-disable no-invalid-this */
            return function (...args) {
                originalMethod.apply(this, args);
                self._attachToPrompt(this);
            };
            /* eslint-enable no-invalid-this */
        });

        this._injectionManager.overrideMethod(proto, '_onVerificationFailed', originalMethod => {
            /* eslint-disable no-invalid-this */
            return function (...args) {
                self._cancelPendingSubmit();
                self._consecutiveFailures += 1;
                return originalMethod.apply(this, args);
            };
            /* eslint-enable no-invalid-this */
        });

        this._injectionManager.overrideMethod(proto, '_onVerificationComplete', originalMethod => {
            /* eslint-disable no-invalid-this */
            return function (...args) {
                self._cancelPendingSubmit();
                self._consecutiveFailures = 0;
                return originalMethod.apply(this, args);
            };
            /* eslint-enable no-invalid-this */
        });

        this._injectionManager.overrideMethod(proto, 'clear', originalMethod => {
            /* eslint-disable no-invalid-this */
            return function (...args) {
                self._cancelPendingSubmit();
                return originalMethod.apply(this, args);
            };
            /* eslint-enable no-invalid-this */
        });

        // If the lock/login prompt already exists (enable while locked), attach now.
        this._attachExisting();
    }

    disable() {
        this._cancelPendingSubmit();

        if (this._injectionManager) {
            this._injectionManager.clear();
            this._injectionManager = null;
        }

        if (this._settings && this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        this._settings = null;
        this._attached = null;
        this._consecutiveFailures = 0;
    }

    _cancelPendingSubmit() {
        if (this._submitTimeoutId) {
            GLib.source_remove(this._submitTimeoutId);
            this._submitTimeoutId = 0;
        }
    }

    _attachExisting() {
        const unlockPrompt = Main.screenShield?.unlockDialog?._authPrompt;
        if (unlockPrompt)
            this._attachToPrompt(unlockPrompt);
    }

    _attachToPrompt(prompt) {
        if (!prompt?._passwordEntry || this._attached.has(prompt))
            return;

        this._attached.add(prompt);

        const clutterText = prompt._passwordEntry.clutter_text;

        clutterText.connect('insert-text', (actor, text, _length) => {
            if (!this._settings?.get_boolean('digits-only'))
                return;

            if (/^\d*$/.test(text))
                return;

            GObject.signal_stop_emission_by_name(actor, 'insert-text');
        });

        clutterText.connect('text-changed', () => {
            this._onPasswordTextChanged(prompt);
        });

        prompt.connect('destroy', () => {
            this._cancelPendingSubmit();
        });
    }

    _onPasswordTextChanged(prompt) {
        if (!this._settings?.get_boolean('enabled'))
            return;

        if (this._consecutiveFailures >= FAILURE_BACKOFF_LIMIT)
            return;

        // Only auto-submit secret (password) prompts, never username/text prompts.
        if (prompt._entry !== prompt._passwordEntry)
            return;

        if (prompt.verificationStatus === AuthPrompt.AuthPromptStatus.VERIFICATION_IN_PROGRESS ||
            prompt.verificationStatus === AuthPrompt.AuthPromptStatus.VERIFYING ||
            prompt.verificationStatus === AuthPrompt.AuthPromptStatus.VERIFICATION_SUCCEEDED)
            return;

        const length = this._settings.get_int('auto-submit-length');
        const text = prompt._passwordEntry.get_text() ?? '';

        if (text.length !== length) {
            this._cancelPendingSubmit();
            return;
        }

        this._cancelPendingSubmit();
        this._submitTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SUBMIT_DELAY_MS, () => {
            this._submitTimeoutId = 0;
            this._trySubmit(prompt, length);
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._submitTimeoutId, '[xlr8login] auto-submit');
    }

    _trySubmit(prompt, expectedLength) {
        if (!this._settings?.get_boolean('enabled'))
            return;

        if (this._consecutiveFailures >= FAILURE_BACKOFF_LIMIT)
            return;

        if (prompt._entry !== prompt._passwordEntry)
            return;

        if (!prompt._passwordEntry.reactive)
            return;

        const text = prompt._passwordEntry.get_text() ?? '';
        if (text.length !== expectedLength)
            return;

        if (prompt.verificationStatus === AuthPrompt.AuthPromptStatus.VERIFICATION_IN_PROGRESS ||
            prompt.verificationStatus === AuthPrompt.AuthPromptStatus.VERIFYING)
            return;

        // Same path as pressing Enter in AuthPrompt.
        prompt._passwordEntry.clutter_text.emit('activate');
    }
}
