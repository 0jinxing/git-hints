# Git Hints - VSCode 插件

一个VSCode插件，以inline-hint的方式显示当前代码的commit信息和作者，支持点击查看详细改动。

## 功能特性

- 📝 **Inline Hint显示**: 在代码行末显示commit ID和作者信息
- 🖱️ **点击交互**: 鼠标悬停显示详细信息，可点击查看完整提交记录
- ⚙️ **可配置**: 支持自定义显示内容（commit ID、作者名）
- 🎯 **智能显示**: 只显示当前光标所在行的git信息（可配置为显示所有行）
- 🔄 **实时更新**: 文件修改后自动更新git信息
- 📊 **性能优化**: 智能缓存机制，避免重复git操作

## 使用方法

### 基本使用

1. 安装插件后，打开任意git仓库中的文件
2. **智能显示模式**：只显示当前光标所在行的git信息
3. 鼠标悬停在hint上可查看详细信息
4. 点击hover中的链接可查看完整提交详情
5. 光标移动时，hint会自动跟随显示当前行的信息

### 命令

- `Git Hints: Toggle Git Hints` - 切换显示/隐藏git hints
- `Git Hints: Show Commit Details` - 显示提交详情（通过hover链接调用）

### 配置选项

在VSCode设置中搜索 `gitHints` 进行配置：

- `gitHints.enabled`: 启用/禁用git hints (默认: true)
- `gitHints.showAuthor`: 显示作者名 (默认: true)
- `gitHints.showCommitId`: 显示commit ID (默认: false)
- `gitHints.showDate`: 显示日期 (默认: true)
- `gitHints.compactMode`: 紧凑模式，自动缩短长名称 (默认: true)
- `gitHints.displayMode`: 显示模式，`currentLine`（只显示当前行）或`allLines`（显示所有行）(默认: currentLine)

## 显示格式

每行代码末尾显示格式：`日期 作者`（默认）或自定义格式

### 默认显示格式（时间和作者）
```javascript
console.log('Hello World');  today 21:14 Jones
console.log('Another line');  2024/12/13 14:30 Smith
```

### 时间格式说明
- 今天的提交：`today HH:MM`
- 其他日期：`YYYY/MM/DD HH:MM`

### 自定义显示
你可以通过配置选项控制显示内容：
- 只显示时间和作者：`today 21:14 Jones`（默认）
- 只显示作者：`Jones`
- 显示commit ID：在hover中查看

## 性能说明

- 使用缓存机制减少git操作
- 文件保存后自动刷新缓存
- 仅对可见编辑器进行更新
- 排除日志文件等特殊文件类型

## 要求

- VSCode 1.106.0 或更高版本
- Git 已安装且在系统PATH中
- 打开的文件夹必须是Git仓库

## 开发

```bash
# 安装依赖
pnpm install

# 编译
pnpm compile

# 运行测试
pnpm test
```

## 许可证

MIT