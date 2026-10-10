# xlr8login

Windows PIN-style **auto-submit** for GNOME: when the lock screen or GDM login password field reaches a configurable length `N`, it submits automatically (no Enter).

**Phase 1 (this release)** submits your **account password** when its length matches `N`.  
**Phase 2 (planned)** adds a real separate PIN via PAM.

## Requirements

- Fedora 42+ (or any distro with GNOME Shell 47–50)
- GNOME Shell / GDM

## Quick start (user session + lock screen)

```bash
make install-user
gnome-extensions enable xlr8login@xlr8login
```

Reload GNOME Shell (`Alt+F2`, `r`, Enter on X11) or log out and back in. On Wayland, log out/in.

Open settings:

```bash
gnome-extensions prefs xlr8login@xlr8login
```

Set **Character count** to your password length (default `4`). Lock with `Super+L` and type the password — it should unlock when the last character is entered.

## System install (Fedora / RPM)

From a git checkout:

```bash
# Optional: build a source RPM-ready tarball
chmod +x scripts/*.sh
./scripts/make-dist.sh

# Local system install (no RPM)
sudo make install
gnome-extensions enable xlr8login@xlr8login
```

Build an RPM:

```bash
./scripts/make-dist.sh
mkdir -p "$HOME/rpmbuild/SOURCES" "$HOME/rpmbuild/SPECS"
cp xlr8login-*.tar.gz "$HOME/rpmbuild/SOURCES/"
cp packaging/xlr8login.spec "$HOME/rpmbuild/SPECS/"
rpmbuild -ba "$HOME/rpmbuild/SPECS/xlr8login.spec"
sudo dnf install "$HOME/rpmbuild/RPMS/noarch/gnome-shell-extension-xlr8login-"*.rpm
```

Or with Meson:

```bash
meson setup build --prefix=/usr
meson install -C build
sudo glib-compile-schemas /usr/share/glib-2.0/schemas
```

## GDM login screen

The extension declares `session-modes: ["user", "unlock-dialog", "gdm"]`. Lock screen works once the extension is enabled for your user. The **login screen** needs a **system** install plus greeter enablement:

```bash
sudo make install                 # or install the RPM
sudo xlr8login-enable-gdm
sudo systemctl restart gdm        # closes graphical sessions
```

Disable on the greeter:

```bash
sudo xlr8login-disable-gdm
sudo systemctl restart gdm
```

`xlr8login-enable-gdm` installs `/etc/dconf/db/gdm.d/00-xlr8login`. If you already customize `org.gnome.shell enabled-extensions` for GDM, merge the UUID `xlr8login@xlr8login` into that list instead of overwriting.

GNOME only honors the `gdm` session mode for **system** extensions under `/usr/share/gnome-shell/extensions/`. A user install under `~/.local` still covers the lock screen (`unlock-dialog`).

## Settings

| Key | Default | Meaning |
|-----|---------|---------|
| Enable auto-submit | on | Master toggle |
| Character count | 4 | Submit when length equals `N` (4–32) |
| Digits only | off | Ignore non-digit keystrokes |

**Safety:** after three consecutive failed auto-submits, auto-submit pauses until a successful unlock or you change a setting. Pressing Enter always works.

## Manual test checklist

1. Set length to your password length; lock screen; type password — unlocks without Enter.
2. Type a wrong password of length `N` three times — auto-submit pauses; Enter still works.
3. Change length in prefs — backoff resets.
4. With digits-only on, letters are ignored.
5. After system install + `xlr8login-enable-gdm`, log out fully and type the password on the GDM greeter.

## Uninstall

```bash
gnome-extensions disable xlr8login@xlr8login
make uninstall-user          # user install
# or
sudo make uninstall           # system install
sudo xlr8login-disable-gdm    # if greeter was enabled
```

## Architecture (Phase 1)

GNOME unlock and GDM login both use `AuthPrompt` (`St.PasswordEntry`). The extension hooks `_initInputRow`, watches `text-changed` on the password entry, and emits `activate` (same path as Enter) when the length matches `N`. Only secret prompts are auto-submitted.

## Phase 2 plan (not implemented yet)

Real Windows Hello-style PIN — separate from the account password:

1. **`pam_xlr8login.so`** — verify a PIN hash; unwrap the stored account password into `PAM_AUTHTOK` so `pam_unix` / `pam_gnome_keyring` still unlock the login keyring.
2. **Settings app** — set / change / remove PIN with polkit-assisted write of a root-owned hash file (e.g. under `/var/lib/xlr8login/`).
3. **Shell UI** — optional N-dot indicator; “Use password instead” fallback.
4. **PAM drop-ins** for `gdm-password` and lock-screen unlock; recommend **lock-screen-only** as the default until cold-login keyring unwrap is solid.
5. Extend the same Fedora RPM to ship PAM, polkit rules, and the settings binary.

Until Phase 2 ships, set your account password length equal to `N` (or set `N` to your password length). Auto-submitting a partial password will fail by design.

## Explicitly out of scope (for now)

- Browser passkeys / Windows Hello WebAuthn (needs a platform authenticator stack, not this extension).
- Fingerprint / TPM beyond what Fedora already provides (`fprintd`).

## License

GPL-2.0-or-later. See [COPYING](COPYING).
