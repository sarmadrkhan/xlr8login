project('xlr8login',
  version: '0.2.0',
  meson_version: '>= 0.61.0',
  license: 'GPL-2.0-or-later',
)

uuid = 'xlr8login@xlr8login'
datadir = get_option('datadir')
bindir = get_option('bindir')
localstatedir = get_option('localstatedir')

extension_dir = datadir / 'gnome-shell' / 'extensions' / uuid
schema_dir = datadir / 'glib-2.0' / 'schemas'
share_dir = datadir / 'xlr8login'

install_data(
  'extension/metadata.json',
  'extension/extension.js',
  'extension/prefs.js',
  'extension/prefs.ui',
  install_dir: extension_dir,
)

install_data(
  'extension/schemas/org.gnome.shell.extensions.xlr8login.gschema.xml',
  install_dir: schema_dir,
)

install_data(
  'packaging/gdm/00-xlr8login',
  install_dir: share_dir,
)

install_data(
  'scripts/xlr8login-enable-gdm',
  'scripts/xlr8login-disable-gdm',
  install_dir: bindir,
  install_mode: 'rwxr-xr-x',
)

meson.add_install_script(
  'sh', '-c',
  'mkdir -p "$DESTDIR' + localstatedir + '/lib/xlr8login" && chmod 1777 "$DESTDIR' + localstatedir + '/lib/xlr8login"',
)

summary({
  'extension': extension_dir,
  'schemas': schema_dir,
}, section: 'Directories')
