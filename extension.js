/*
 * Desktop File Manager for GNOME Shell
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {AppMenu} from 'resource:///org/gnome/shell/ui/appMenu.js';
import * as Dialog from 'resource:///org/gnome/shell/ui/dialog.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class DesktopFileManagerExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._injectionManager = new InjectionManager();
        this._modifiedMenus = [];
        this._settingsSignals = [];

        this._localizedStrings = {
            'editEntry': _('Edit Entry'),
            'openLocation': _('Open Entry Location'),
            'viewProperties': _('Properties'),
            'deleteEntry': _('Remove from system'),
            'appDetails': _('App Details'),
            'confirmDelete': _('Remove'),
            'cancelDelete': _('Cancel'),
            'deleteWarning': _('Are you sure you want to remove this application entry? This action cannot be undone.'),
        };

        this._settingsSignals.push(this._settings.connect('changed::hide-edit-menu-item', (settings, key) => {
            if (settings.get_boolean(key)) {
                this._removeMenuItems('edit');
            }
        }));
        this._settingsSignals.push(this._settings.connect('changed::hide-open-location-menu-item', (settings, key) => {
            if (settings.get_boolean(key)) {
                this._removeMenuItems('openLocation');
            }
        }));
        this._settingsSignals.push(this._settings.connect('changed::hide-properties-menu-item', (settings, key) => {
            if (settings.get_boolean(key)) {
                this._removeMenuItems('properties');
            }
        }));
        this._settingsSignals.push(this._settings.connect('changed::hide-delete-menu-item', (settings, key) => {
            if (settings.get_boolean(key)) {
                this._removeMenuItems('delete');
            }
        }));

        this._injectionManager.overrideMethod(AppMenu.prototype, 'open',
            originalMethod => {
                const ext = this;
                const modifiedMenus = this._modifiedMenus;
                const localizedStrings = this._localizedStrings;

                return function (...args) {
                    const settings = ext._settings;
                    const appInfo = this._app?.app_info;
                    const filename = ext._getDesktopFilename(appInfo);
                    if (!settings) {
                        return originalMethod.call(this, ...args);
                    }
                    if (!appInfo) {
                        return originalMethod.call(this, ...args);
                    }
                    if (!filename) {
                        return originalMethod.call(this, ...args);
                    }

                    if (!settings.get_boolean('hide-edit-menu-item') && !this._dfmEditMenuItem) {
                        let editMenuItem = this.addAction(localizedStrings.editEntry, () => {
                            ext._openDesktopFile(appInfo);
                            ext._hideOverview();
                        });
                        ext._moveMenuItemAfter(this, editMenuItem, localizedStrings.appDetails);
                        this._dfmEditMenuItem = editMenuItem;
                    }

                    if (!settings.get_boolean('hide-open-location-menu-item') && !this._dfmOpenLocationMenuItem) {
                        let openLocationMenuItem = this.addAction(localizedStrings.openLocation, () => {
                            ext._openDesktopFileLocation(appInfo);
                            ext._hideOverview();
                        });
                        ext._moveMenuItemAfter(this, openLocationMenuItem, localizedStrings.editEntry);
                        this._dfmOpenLocationMenuItem = openLocationMenuItem;
                    }

                    if (!settings.get_boolean('hide-properties-menu-item') && !this._dfmPropertiesMenuItem) {
                        let propertiesMenuItem = this.addAction(localizedStrings.viewProperties, () => {
                            ext._showPropertiesDialog(appInfo);
                            ext._hideOverview();
                        });
                        ext._moveMenuItemAfter(this, propertiesMenuItem, localizedStrings.openLocation);
                        this._dfmPropertiesMenuItem = propertiesMenuItem;
                    }

                    if (!settings.get_boolean('hide-delete-menu-item') && !this._dfmDeleteMenuItem) {
                        let deleteMenuItem = this.addAction(localizedStrings.deleteEntry, () => {
                            ext._confirmAndDeleteDesktopFile(appInfo);
                        });
                        ext._moveMenuItemAfter(this, deleteMenuItem, localizedStrings.viewProperties);
                        this._dfmDeleteMenuItem = deleteMenuItem;
                    }

                    if (!modifiedMenus.includes(this)) {
                        modifiedMenus.push(this);
                    }

                    return originalMethod.call(this, ...args);
                };
            }
        );
    }

    _getDesktopFilename(appInfo) {
        if (!appInfo) {
            return null;
        }

        if (typeof appInfo.get_filename === 'function') {
            return appInfo.get_filename();
        }

        return appInfo.filename ?? null;
    }

    _readDesktopEntry(filename) {
        if (!filename) {
            return null;
        }

        try {
            const keyFile = new GLib.KeyFile();
            keyFile.load_from_file(filename, GLib.KeyFileFlags.NONE);

            if (!keyFile.has_group('Desktop Entry')) {
                return null;
            }

            const readString = key => {
                try {
                    return keyFile.get_locale_string('Desktop Entry', key, null);
                } catch {
                    return null;
                }
            };

            const readBoolean = key => {
                try {
                    return keyFile.get_boolean('Desktop Entry', key);
                } catch {
                    return null;
                }
            };

            return {
                Name: readString('Name'),
                GenericName: readString('GenericName'),
                Comment: readString('Comment'),
                Exec: readString('Exec'),
                TryExec: readString('TryExec'),
                Path: readString('Path'),
                Icon: readString('Icon'),
                Terminal: readBoolean('Terminal'),
                Type: readString('Type'),
                Categories: readString('Categories'),
                StartupWMClass: readString('StartupWMClass'),
                NoDisplay: readBoolean('NoDisplay'),
                Hidden: readBoolean('Hidden'),
            };
        } catch {
            return null;
        }
    }

    _hideOverview() {
        if (Main.overview.visible) {
            Main.overview.hide();
        }
    }

    _moveMenuItemAfter(menu, menuItemToMove, afterLabel) {
        let menuItems = menu._getMenuItems();
        for (let i = 0; i < menuItems.length; i++) {
            let menuItem = menuItems[i];
            if (menuItem.label) {
                if (menuItem.label.text === afterLabel) {
                    menu.moveMenuItem(menuItemToMove, i + 1);
                    return true;
                }
            }
        }
        return false;
    }

    _openDesktopFile(appInfo) {
        const filename = this._getDesktopFilename(appInfo);

        if (!filename) {
            return;
        }

        let uri = Gio.File.new_for_path(filename).get_uri();
        Gio.AppInfo.launch_default_for_uri_async(uri, null, null, () => {});
    }

    _openDesktopFileLocation(appInfo) {
        const filename = this._getDesktopFilename(appInfo);
        if (!filename) {
            return;
        }

        const file = Gio.File.new_for_path(filename);
        const uri = file.get_uri();
        const parent = file.get_parent();
        if (!uri) {
            return;
        }

        Gio.DBus.session.call(
            'org.freedesktop.FileManager1',
            '/org/freedesktop/FileManager1',
            'org.freedesktop.FileManager1',
            'ShowItems',
            new GLib.Variant('(ass)', [[uri], '']),
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            (conn, res) => {
                try {
                    conn.call_finish(res);
                } catch {
                    if (parent) {
                        Gio.AppInfo.launch_default_for_uri_async(parent.get_uri(), null, null, () => {});
                    }
                }
            }
        );
    }

    _showPropertiesDialog(appInfo) {
        const filename = this._getDesktopFilename(appInfo);
        const desktopEntry = this._readDesktopEntry(filename);
        let content = '';

        try {
            if (filename) {
                const file = Gio.File.new_for_path(filename);
                const [ok, contents] = file.load_contents(null);
                if (ok) {
                    content = new TextDecoder().decode(contents);
                }
            }
        } catch (e) {
            content = `Error reading file: ${e.message}`;
        }

        if (this._propertiesDialog)
            this._propertiesDialog.close();

        const dialog = new ModalDialog.ModalDialog({destroyOnClose: true});
        const header = new Dialog.MessageDialogContent({
            title: _('Application Properties'),
            description: appInfo.get_name() ?? '',
        });
        dialog.contentLayout.add_child(header);

        const rowsBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: true,
            style: 'spacing: 8px;',
        });

        const addInfoRow = (label, value) => {
            const row = new St.BoxLayout({
                x_expand: true,
                vertical: false,
                style: 'spacing: 12px;',
            });

            const labelText = new St.Label({
                text: `${label}:`,
                y_align: Clutter.ActorAlign.START,
                style_class: 'dim-label',
            });
            labelText.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

            const valueText = new St.Label({
                text: value ? String(value) : '-',
                x_expand: true,
                y_align: Clutter.ActorAlign.START,
            });
            valueText.clutter_text.line_wrap = true;
            valueText.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

            row.add_child(labelText);
            row.add_child(valueText);
            rowsBox.add_child(row);
        };

        addInfoRow(_('File Location'), filename || '-');
        addInfoRow(_('Description'), appInfo.get_description() || '-');
        addInfoRow(_('Command'), appInfo.get_commandline() || '-');
        addInfoRow(_('Executable'), appInfo.get_executable() || '-');
        addInfoRow(_('Icon'), appInfo.get_icon()?.to_string() || '-');
        addInfoRow(_('Categories'), appInfo.get_categories() || '-');

        if (desktopEntry) {
            addInfoRow('Desktop.Name', desktopEntry.Name || '-');
            addInfoRow('Desktop.GenericName', desktopEntry.GenericName || '-');
            addInfoRow('Desktop.Comment', desktopEntry.Comment || '-');
            addInfoRow('Desktop.Exec', desktopEntry.Exec || '-');
            addInfoRow('Desktop.TryExec', desktopEntry.TryExec || '-');
            addInfoRow('Desktop.Icon', desktopEntry.Icon || '-');
            addInfoRow('Desktop.Terminal', desktopEntry.Terminal === null ? '-' : String(desktopEntry.Terminal));
            addInfoRow('Desktop.Type', desktopEntry.Type || '-');
            addInfoRow('Desktop.Categories', desktopEntry.Categories || '-');
            addInfoRow('Desktop.Path', desktopEntry.Path || '-');
            addInfoRow('Desktop.StartupWMClass', desktopEntry.StartupWMClass || '-');
            addInfoRow('Desktop.NoDisplay', desktopEntry.NoDisplay === null ? '-' : String(desktopEntry.NoDisplay));
            addInfoRow('Desktop.Hidden', desktopEntry.Hidden === null ? '-' : String(desktopEntry.Hidden));
        }

        const previewLimit = 12000;
        const previewContent = content.length > previewLimit
            ? `${content.slice(0, previewLimit)}\n\n... [content truncated]`
            : (content || '-');

        const contentTitle = new St.Label({
            text: _('Desktop File Content'),
            style: 'font-weight: bold; padding-top: 6px;',
        });
        contentTitle.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        rowsBox.add_child(contentTitle);

        const contentText = new St.Label({
            text: previewContent,
            x_expand: true,
            style: 'font-family: monospace;',
        });
        contentText.clutter_text.line_wrap = true;
        contentText.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        rowsBox.add_child(contentText);

        const scrollView = new St.ScrollView({
            x_expand: true,
            y_expand: true,
            overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            child: rowsBox,
        });
        dialog.contentLayout.add_child(scrollView);

        dialog.addButton({
            label: _('Open File Location'),
            action: () => this._openDesktopFileLocation(appInfo),
        });
        dialog.addButton({
            label: _('Close'),
            key: Clutter.KEY_Escape,
            default: true,
            action: () => dialog.close(),
        });

        dialog.connect('closed', () => {
            if (this._propertiesDialog === dialog)
                this._propertiesDialog = null;
        });

        this._propertiesDialog = dialog;
        dialog.open();
    }

    _confirmAndDeleteDesktopFile(appInfo) {
        const filename = this._getDesktopFilename(appInfo);
        if (!filename) {
            return;
        }

        if (this._deleteDialog)
            this._deleteDialog.close();

        const dialog = new ModalDialog.ModalDialog({destroyOnClose: true});
        const content = new Dialog.MessageDialogContent({
            title: _('Remove Application Entry'),
            description: this._localizedStrings.deleteWarning,
        });
        dialog.contentLayout.add_child(content);

        const fileLabel = new St.Label({
            text: filename,
            x_expand: true,
            style: 'font-size: 0.9em;',
        });
        fileLabel.clutter_text.line_wrap = true;
        fileLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        dialog.contentLayout.add_child(fileLabel);

        dialog.addButton({
            label: this._localizedStrings.cancelDelete,
            key: Clutter.KEY_Escape,
            action: () => dialog.close(),
        });
        dialog.addButton({
            label: this._localizedStrings.confirmDelete,
            default: true,
            action: () => {
                this._deleteDesktopFile(filename, appInfo);
                dialog.close();
            },
        });

        dialog.connect('closed', () => {
            if (this._deleteDialog === dialog)
                this._deleteDialog = null;
        });

        this._deleteDialog = dialog;
        dialog.open();
    }

    _deleteDesktopFile(filename, appInfo) {
        try {
            const file = Gio.File.new_for_path(filename);
            
            if (!file.query_exists(null)) {
                this._showNotification(_('Desktop file not found'), 'dialog-error');
                return;
            }
            
            file.delete(null);
            const appName = appInfo?.get_name?.() ?? filename;

            this._showNotification(
                _(`"${appName}" has been removed from the applications menu.`),
                'dialog-information'
            );

            this._refreshApplicationsMenu();

        } catch (e) {
            if (this._isPermissionDeniedError(e)) {
                this._showNotification(
                    _('Permission denied. Please remove this desktop entry with an administrator-capable file manager.'),
                    'dialog-error'
                );
                return;
            }

            this._showNotification(
                `${_('Failed to delete desktop file:')} ${e.message}`,
                'dialog-error'
            );
        }
    }

    _isPermissionDeniedError(error) {
        try {
            return error.matches(Gio.io_error_quark(), Gio.IOErrorEnum.PERMISSION_DENIED);
        } catch {
            const msg = (error?.message ?? '').toLowerCase();
            return msg.includes('permission denied') || msg.includes('not permitted');
        }
    }

    _refreshApplicationsMenu() {
        try {
            const appSys = Shell.AppSystem.get_default();
            appSys.emit('installed-changed');
        } catch (e) {
            this._showNotification(
                _('Please log out and log back in to see the changes.'),
                'dialog-information'
            );
        }
    }

    _showNotification(message, iconName) {
        const app = Gio.Application.get_default();

        if (app) {
            const notification = new Gio.Notification();
            notification.set_title(_('Desktop File Manager'));
            notification.set_body(message);
            if (iconName) {
                notification.set_icon_name(iconName);
            }
            app.send_notification(null, notification);
            return;
        }

        Main.notify(_('Desktop File Manager'), message);
    }

    _removeMenuItems(type) {
        if (!this._modifiedMenus) {
            return;
        }

        const removeFromMenu = (menu, propertyName) => {
            if (!menu[propertyName]) {
                return;
            }

            menu[propertyName].destroy();
            delete menu[propertyName];
        };

        for (let menu of this._modifiedMenus) {
            if (type === 'edit' || type === 'all')
                removeFromMenu(menu, '_dfmEditMenuItem');

            if (type === 'openLocation' || type === 'all')
                removeFromMenu(menu, '_dfmOpenLocationMenuItem');

            if (type === 'properties' || type === 'all')
                removeFromMenu(menu, '_dfmPropertiesMenuItem');

            if (type === 'delete' || type === 'all')
                removeFromMenu(menu, '_dfmDeleteMenuItem');
        }
    }

    disable() {
        if (this._propertiesDialog) {
            this._propertiesDialog.close();
            this._propertiesDialog = null;
        }
        if (this._deleteDialog) {
            this._deleteDialog.close();
            this._deleteDialog = null;
        }

        if (this._settings && this._settingsSignals) {
            for (const signalId of this._settingsSignals)
                this._settings.disconnect(signalId);
        }
        this._settingsSignals = null;

        this._removeMenuItems('all');
        this._modifiedMenus = null;

        this._settings = null;
        this._injectionManager.clear();
        this._injectionManager = null;
    }
}
