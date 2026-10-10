// SPDX-FileCopyrightText: 2026 xlr8login contributors
// SPDX-License-Identifier: GPL-2.0-or-later

import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class Xlr8LoginPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.default_width = 520;
        window.default_height = 420;

        const uiFile = this.dir.get_child('prefs.ui');
        const builder = Gtk.Builder.new_from_file(uiFile.get_path());
        const page = builder.get_object('page');
        window.add(page);

        settings.bind(
            'enabled',
            builder.get_object('enabled_row'),
            'active',
            Gio.SettingsBindFlags.DEFAULT);
        settings.bind(
            'auto-submit-length',
            builder.get_object('length_row'),
            'value',
            Gio.SettingsBindFlags.DEFAULT);
        settings.bind(
            'digits-only',
            builder.get_object('digits_row'),
            'active',
            Gio.SettingsBindFlags.DEFAULT);
    }
}
