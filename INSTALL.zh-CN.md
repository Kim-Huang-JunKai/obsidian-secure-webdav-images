# Secure WebDAV Images 中文安装与升级说明

## 插件定位

`Secure WebDAV Images` 的目标是把图片和笔记分开处理：

- 图片上传到独立的 WebDAV 图片目录
- 笔记和非图片附件同步到独立的远程笔记目录
- 可选按需加载 Markdown 笔记，减轻移动端本地存储压力
- 把网页文章里的远程图片抓回到你自己的 WebDAV，避免继续依赖源站

它更适合：

- 图片很多、移动端空间紧张
- 希望图片和笔记分目录管理
- 希望图片不依赖公开图床

它不适合被理解成：

- Git 式精细合并同步器
- 零风险的任意网络环境多端协作方案

## 0.0.9 升级说明

### 这次主要修复了什么

`0.0.9` 重点修复的是“图片刚上传成功，但过一段时间又像被清掉”的问题。

这个问题的真实根因不是远端图片目录被自动清理，而是：

- 图片已经成功上传到远端图片目录
- 打开的笔记编辑器里也已经出现了新的安全图片引用
- 但 vault 落盘文件在短时间内可能还是旧正文
- 自动同步或图片插入后的优先同步如果读取了旧正文
- 就可能把不含图片引用的旧笔记内容重新同步出去

用户体感上就会表现成：

- 图片一开始是好的
- 过一会图片“没了”

### 0.0.9 现在怎么处理

- Markdown 笔记同步优先读取当前打开编辑器里的实时内容
- 图片插入后的优先同步也优先使用编辑器中的最新正文
- Markdown 的同步签名不再只依赖 `mtime + size`
- 懒加载占位笔记仍然禁止上传成服务器正文

### 谁应该尽快升级

如果你符合下面任一情况，建议尽快升级到 `0.0.9`：

- 正在使用自动同步
- 经常直接粘贴图片
- 之前见过“图片过一会又消失”的现象

## 存储机制

### 远端目录

插件使用两套远端目录：

- `图片远程目录`
  只保存图片
- `远程笔记目录`
  保存 Markdown 笔记和非图片附件

### 图片机制

- 本地图片上传后，笔记会改写成 `secure-webdav` 代码块
- 上传成功后，本地图片文件会删除
- 阅读模式由插件带认证读取远端图片

### 懒加载笔记机制

如果设置为 `按需加载笔记`：

- 服务器保存完整 Markdown 正文
- 本地可以只保留占位文件
- 占位文件只是本地减量手段，不是远端正文

## 重要警告

### 懒加载不是“把正文清空后上传”

这条必须明确：

- 远程笔记目录始终应保存完整正文
- 本地占位文件绝不能上传成远端正文

当前版本已经做了底层保护：

- 一旦识别到 `secure-webdav-note-stub`
- 插件会拒绝把它上传成远端正文

### 远端正文缺失时的处理

当前策略是保守的两阶段确认：

1. 第一次确认远端正文缺失：
   暂时保留本地占位，不上传占位正文
2. 再次确认远端仍缺失：
   自动清理本地失效占位

### 如果你还没有长期验证 WebDAV 稳定性

建议先使用：

- `笔记本地保留模式 = Full local`
- 先手动同步
- 先观察一段时间

确认远端稳定后，再开启 `Lazy notes`

## 桌面端安装

推荐下载发布包：

```text
secure-webdav-images-0.0.9.zip
```

安装步骤：

1. 下载 zip 包
2. 解压
3. 打开你的 vault 目录
4. 进入：

```text
.obsidian/plugins/secure-webdav-images/
```

5. 如果目录不存在就手动创建
6. 复制以下文件进去：
   - `main.js`
   - `manifest.json`
   - `styles.css`
7. 重启 Obsidian
8. 在 `设置 > 社区插件` 中启用 `Secure WebDAV Images`

## Android 安装

步骤和桌面端基本一致：

1. 下载 `secure-webdav-images-0.0.9.zip`
2. 解压
3. 打开你的 vault 目录
4. 进入：

```text
<你的 Vault>/.obsidian/plugins/secure-webdav-images/
```

5. 复制以下文件进去：
   - `main.js`
   - `manifest.json`
   - `styles.css`
6. 重启 Obsidian
7. 到 `设置 > 社区插件` 里启用插件

### 覆盖更新建议

升级时建议直接覆盖：

- `main.js`
- `manifest.json`
- `styles.css`

不要删除：

- `data.json`

这样可以保留你的配置项。

## 首次配置

启用后先配置：

- `WebDAV base URL`
- `Username`
- `Password`
- `Image remote folder`
- `Remote notes folder`
- `Auto sync frequency`
- `Note local retention mode`
- `Note eviction days`

建议：

- 图片目录和笔记目录必须分开
- 不要把两者配置成同一个远端目录

## 推荐验证顺序

1. 运行 `Test WebDAV connection`
2. 迁移旧笔记中的原生图片引用
3. 手动执行一次 `Sync vault content to WebDAV`
4. 先用 `Full local`
5. 确认远端正文稳定后，再考虑启用 `Lazy notes`

## 命令说明

### `Upload local images in current note to WebDAV`

作用：

- 只处理当前笔记里的本地图片
- 上传到远端图片目录
- 改写为 `secure-webdav` 代码块
- 上传成功后删除本地图片

### `Test WebDAV connection`

作用：

- 测试 WebDAV 的上传、读取、删除链路是否正常

### `Sync vault content to WebDAV`

作用：

- 对账同步笔记和非图片附件
- 上传新增或变更内容
- 拉取远端更新
- 处理明确删除的笔记内容

## 当前建议

如果你是第一次使用这个插件，建议按这个顺序：

1. 先升级到 `0.0.9`
2. 先用 `Full local`
3. 先观察一段时间图片上传和笔记同步
4. 再决定是否启用懒加载
