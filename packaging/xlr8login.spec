Name:           gnome-shell-extension-xlr8login
Version:        0.1.0
Release:        1%{?dist}
Summary:        Auto-submit GNOME login/lock password after N characters

License:        GPL-2.0-or-later
URL:            https://github.com/xlr8login/xlr8login
Source0:        xlr8login-%{version}.tar.gz

BuildArch:      noarch
BuildRequires:  make
BuildRequires:  glib2
Requires:       gnome-shell >= 47
Requires:       dconf

%description
xlr8login is a GNOME Shell extension that auto-submits the lock screen and
GDM login password field after a configurable number of characters
(Windows PIN-style UX).

Phase 1 submits your existing account password when its length matches N.
A separate PIN credential via PAM is planned for Phase 2.

%prep
%autosetup -n xlr8login-%{version}

%build
# No compiled sources; schemas compile in %%post.

%install
%make_install PREFIX=%{_prefix}

%post
glib-compile-schemas %{_datadir}/glib-2.0/schemas &>/dev/null || :
echo "Enable for your session: gnome-extensions enable xlr8login@xlr8login"
echo "Enable for GDM login:    sudo xlr8login-enable-gdm"

%postun
glib-compile-schemas %{_datadir}/glib-2.0/schemas &>/dev/null || :

%files
%license COPYING
%doc README.md
%{_datadir}/gnome-shell/extensions/xlr8login@xlr8login/
%{_datadir}/glib-2.0/schemas/org.gnome.shell.extensions.xlr8login.gschema.xml
%{_datadir}/xlr8login/
%{_bindir}/xlr8login-enable-gdm
%{_bindir}/xlr8login-disable-gdm

%changelog
* Sat Oct 10 2026 xlr8login contributors <xlr8login@localhost> - 0.1.0-1
- Initial Fedora package: Phase 1 auto-submit extension
