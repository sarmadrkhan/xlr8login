# SPDX-License-Identifier: GPL-2.0-or-later

UUID := xlr8login@xlr8login
NAME := xlr8login
VERSION := 0.2.0

PREFIX ?= /usr
DATADIR := $(PREFIX)/share
EXTDIR := $(DATADIR)/gnome-shell/extensions/$(UUID)
SCHEMADIR := $(DATADIR)/glib-2.0/schemas
DCONFDIR := $(PREFIX)/share/xlr8login
BINDIR := $(PREFIX)/bin

USER_EXTDIR := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: all schemas install install-user uninstall uninstall-user enable-user zip dist clean

all: schemas

schemas:
	glib-compile-schemas extension/schemas

install: schemas
	install -d $(DESTDIR)$(EXTDIR)
	install -m 644 extension/metadata.json $(DESTDIR)$(EXTDIR)/
	install -m 644 extension/extension.js $(DESTDIR)$(EXTDIR)/
	install -m 644 extension/prefs.js $(DESTDIR)$(EXTDIR)/
	install -m 644 extension/prefs.ui $(DESTDIR)$(EXTDIR)/
	install -d $(DESTDIR)$(SCHEMADIR)
	install -m 644 extension/schemas/org.gnome.shell.extensions.xlr8login.gschema.xml \
		$(DESTDIR)$(SCHEMADIR)/
	install -d $(DESTDIR)$(DCONFDIR)
	install -m 644 packaging/gdm/00-xlr8login $(DESTDIR)$(DCONFDIR)/00-xlr8login
	install -d $(DESTDIR)$(BINDIR)
	install -m 755 scripts/xlr8login-enable-gdm $(DESTDIR)$(BINDIR)/xlr8login-enable-gdm
	install -m 755 scripts/xlr8login-disable-gdm $(DESTDIR)$(BINDIR)/xlr8login-disable-gdm
	# World-traversable sticky dir so each user can write <user>.json for the GDM greeter.
	install -d -m 1777 $(DESTDIR)/var/lib/xlr8login
	@if [ -z "$(DESTDIR)" ]; then \
		glib-compile-schemas $(SCHEMADIR); \
	fi

install-user: schemas
	install -d $(USER_EXTDIR)/schemas
	install -m 644 extension/metadata.json $(USER_EXTDIR)/
	install -m 644 extension/extension.js $(USER_EXTDIR)/
	install -m 644 extension/prefs.js $(USER_EXTDIR)/
	install -m 644 extension/prefs.ui $(USER_EXTDIR)/
	install -m 644 extension/schemas/org.gnome.shell.extensions.xlr8login.gschema.xml \
		$(USER_EXTDIR)/schemas/
	glib-compile-schemas $(USER_EXTDIR)/schemas
	@echo "Installed to $(USER_EXTDIR)"
	@echo "Enable with: gnome-extensions enable $(UUID)"
	@echo "Then log out/in or press Alt+F2, type r, Enter (on X11)."

uninstall:
	rm -rf $(DESTDIR)$(EXTDIR)
	rm -f $(DESTDIR)$(SCHEMADIR)/org.gnome.shell.extensions.xlr8login.gschema.xml
	-glib-compile-schemas $(DESTDIR)$(SCHEMADIR)
	rm -f $(DESTDIR)$(BINDIR)/xlr8login-enable-gdm
	rm -f $(DESTDIR)$(BINDIR)/xlr8login-disable-gdm
	rm -rf $(DESTDIR)$(DCONFDIR)
	@if [ -z "$(DESTDIR)" ]; then \
		glib-compile-schemas $(SCHEMADIR) || true; \
	fi

uninstall-user:
	rm -rf $(USER_EXTDIR)

enable-user: install-user
	gnome-extensions enable $(UUID) || true

zip: schemas
	rm -f $(UUID).shell-extension.zip
	cd extension && zip -r ../$(UUID).shell-extension.zip \
		metadata.json extension.js prefs.js prefs.ui \
		schemas/org.gnome.shell.extensions.xlr8login.gschema.xml \
		schemas/gschemas.compiled

dist: zip
	@echo "Built $(UUID).shell-extension.zip (version $(VERSION))"

clean:
	rm -f extension/schemas/gschemas.compiled
	rm -f $(UUID).shell-extension.zip
