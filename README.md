# Desktop File Manager

GNOME Shell 扩展 - 在应用菜单中直接管理 .desktop 文件

## 功能

右键点击应用图标时，会显示以下选项：

1. **Edit Entry** - 使用系统默认编辑器或自定义命令编辑 .desktop 文件
2. **Open Entry Location** - 在文件管理器中打开 .desktop 文件所在位置
3. **Properties** - 查看应用属性（包括文件位置、描述、命令等）
4. **Remove from system** - 删除 .desktop 文件（仅支持用户安装的应用）

## 安装

1. 将此扩展复制到 GNOME Shell 扩展目录：
   ```bash
   cp -r ~/.local/share/gnome-shell/extensions/desktopfilemanager@custom/
   ```

2. 重新加载 GNOME Shell：
   - 按 `Alt+F2`，输入 `r`，回车（X11 会话）
   - 或注销并重新登录（Wayland）

3. 启用扩展：
   ```bash
   gnome-extensions enable desktopfilemanager@custom
   ```

## 使用

1. 按 `Super` 键打开 Activities 概览
2. 点击 "Show Applications" 图标
3. 右键点击任意应用图标
4. 从上下文菜单中选择操作

## 删除限制

- 只能删除用户安装的应用（`~/.local/share/applications/`）
- 无法删除系统级应用（`/usr/share/applications/`）

## 文件位置

- 扩展目录: `~/.local/share/gnome-shell/extensions/desktopfilemanager@custom/`
- 用户 .desktop 文件: `~/.local/share/applications/`
- 系统 .desktop 文件: `/usr/share/applications/`
