# xlr8login

Windows PIN-style **auto-submit** for GNOME.

Type your password on the lock screen or GDM login screen — when it reaches a length you choose, it submits automatically. No Enter key.

![GNOME Shell 47–50](https://img.shields.io/badge/GNOME_Shell-47--50-blue)
![License](https://img.shields.io/badge/license-GPL--2.0--or--later-green)

## Features

- Auto-submit after **N** characters (configurable, 4–32)
- Works on the **lock screen** and **GDM login** (after system install)
- Optional **digits-only** filter for PIN-like passwords
- After a failed auto-submit, auto-submit pauses so you can type a longer password and press Enter
- Enter always works

> Phase 1 uses your **account password**. A separate PIN credential (PAM) is planned later.

## Requirements

- GNOME Shell 47+
- Fedora-focused packaging; other distros can use the user install

## Install (lock screen)

```bash
git clone https://github.com/sarmadrkhan/xlr8login.git
cd xlr8login
make install-user
gnome-extensions enable xlr8login@xlr8login
```

Log out and back in (Wayland). Then open settings:

```bash
gnome-extensions prefs xlr8login@xlr8login
```

Set **Character count** to your password length and lock with `Super+L`.

## Install (login screen after reboot)

The GDM greeter only loads **system** extensions:

```bash
sudo make install
sudo xlr8login-enable-gdm
sudo systemctl restart gdm   # ends the graphical session
```

Your settings are exported to `/var/lib/xlr8login/<username>.json` so the greeter can use the same character count (it cannot read `~/.config`).

Disable on the greeter:

```bash
sudo xlr8login-disable-gdm
sudo systemctl restart gdm
```

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Enable auto-submit | on | Master toggle |
| Character count | 4 | Submit when length equals N |
| Digits only | off | Ignore non-digit keys |

## Uninstall

```bash
gnome-extensions disable xlr8login@xlr8login
make uninstall-user          # user install
# or
sudo make uninstall          # system install
sudo xlr8login-disable-gdm   # if GDM was enabled
```

## Fedora RPM

```bash
./scripts/make-dist.sh
mkdir -p ~/rpmbuild/{SOURCES,SPECS}
cp xlr8login-*.tar.gz ~/rpmbuild/SOURCES/
cp packaging/xlr8login.spec ~/rpmbuild/SPECS/
rpmbuild -ba ~/rpmbuild/SPECS/xlr8login.spec
sudo dnf install ~/rpmbuild/RPMS/noarch/gnome-shell-extension-xlr8login-*.rpm
```

## How it works

GNOME unlock and GDM login both use `AuthPrompt`. The extension watches the password field and calls the same submit path as Enter when the length matches N.

On the greeter, per-user settings are loaded from `/var/lib/xlr8login/<user>.json` because the `gdm` user cannot read home directories.

## Roadmap

- **Phase 2:** Real separate PIN via PAM (with password unwrap for the login keyring)
- Optional N-dot PIN UI and password fallback
- Browser / passkey integration is out of scope for now

## License

GPL-2.0-or-later. See [COPYING](COPYING).
