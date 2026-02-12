# 命题四：导出引擎设计文档

> 文档编号: RPT-EXPORT-007
> 版本: 1.0
> 更新日期: 2026-02-13
> 状态: 设计评审中
> 前置文档: [02-architecture-design.md](./02-architecture-design.md)

---

## 目录

1. [PDF 导出引擎 (browserless HTTP API)](#1-pdf-导出引擎-browserless-http-api)
2. [Word 导出引擎 (docx-rs)](#2-word-导出引擎-docx-rs)
3. [HTML 导出](#3-html-导出)
4. [SVG 图表生成 (plotters)](#4-svg-图表生成-plotters)
5. [MinIO 文件存储策略](#5-minio-文件存储策略)
6. [异步导出任务流程](#6-异步导出任务流程)

---

## 1. PDF 导出引擎 (browserless HTTP API)

### 1.1 browserless 容器配置

#### 当前状态

当前 `docker-compose.yml` 中 browserless 服务位于 `profiles: ["crawler"]` 下（第 302-320 行），仅在 crawler profile 激活时启动。Worker 服务已配置环境变量 `LAW_EYE__BROWSERLESS__URL: "http://browserless:3000"` 和 `LAW_EYE__BROWSERLESS__TIMEOUT_MS: "30000"`。

#### 方案：创建 `reporter` profile 并行挂载

为避免影响现有 crawler 工作流，采用 **profile 并行挂载** 方案：将 browserless 同时加入 `crawler` 和 `reporter` 两个 profile。当任一 profile 激活时 browserless 自动启动。

```yaml
# docker-compose.yml 修改
browserless:
  image: ${BROWSERLESS_IMAGE:-ghcr.io/browserless/chromium:v2.24.2}
  profiles: ["crawler", "reporter"]   # 新增 reporter profile
  environment:
    MAX_CONCURRENT_SESSIONS: ${BROWSERLESS_MAX_CONCURRENT:-5}
    CONNECTION_TIMEOUT: ${BROWSERLESS_CONNECTION_TIMEOUT:-60000}
    PREBOOT_CHROME: "true"
    TOKEN: ${BROWSERLESS_TOKEN:-}
    # 报告导出专用配置
    MAX_QUEUE_LENGTH: ${BROWSERLESS_MAX_QUEUE:-10}
    TIMEOUT: ${BROWSERLESS_TIMEOUT:-120000}  # 单次渲染超时 120s (大型报告)
  ports:
    - "127.0.0.1:${BROWSERLESS_HOST_PORT:-3003}:3000"
  # 中文字体卷挂载
  volumes:
    - ./fonts:/usr/share/fonts/custom:ro
  healthcheck:
    test: ["CMD", "wget", "-qO-", "http://localhost:3000/json/version"]
    interval: 15s
    timeout: 5s
    retries: 5
    start_period: 10s
  networks:
    - law-eye-network
  restart: unless-stopped
```

**启动方式：**

```bash
# 仅启动报告功能所需的 browserless
docker compose --profile reporter up -d browserless

# 同时启动 crawler + reporter（browserless 只启动一个实例）
docker compose --profile crawler --profile reporter up -d
```

#### 并发控制策略

| 参数 | 值 | 说明 |
|:-----|:---|:-----|
| `MAX_CONCURRENT_SESSIONS` | 5 (默认) | 同时渲染的最大页面数，超过则排队 |
| `MAX_QUEUE_LENGTH` | 10 | 排队等待的最大任务数，超过则拒绝 (503) |
| `CONNECTION_TIMEOUT` | 60000ms | WebSocket 连接超时 |
| `TIMEOUT` | 120000ms | 单次渲染总超时 (含 PDF 生成) |

Rust 端应在 `PdfExporter` 中维护一个信号量 (semaphore)，限制并发请求数不超过 `MAX_CONCURRENT_SESSIONS`，避免 503 拒绝：

```rust
use tokio::sync::Semaphore;

pub struct PdfExporter {
    browserless_url: String,
    http_client: reqwest::Client,
    /// 并发渲染限制，与 browserless MAX_CONCURRENT_SESSIONS 对齐
    render_semaphore: Semaphore,
}

impl PdfExporter {
    pub fn new(browserless_url: String, max_concurrent: usize) -> Self {
        Self {
            browserless_url,
            http_client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(120))
                .pool_max_idle_per_host(max_concurrent)
                .build()
                .expect("Failed to build HTTP client"),
            render_semaphore: Semaphore::new(max_concurrent),
        }
    }
}
```

### 1.2 HTML -> PDF 转换流程

#### 完整 Rust 代码签名

```rust
use law_eye_common::{Error, Result};
use serde::{Deserialize, Serialize};

/// PDF 页边距配置 (单位: 像素字符串，如 "25mm")
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfMargin {
    pub top: String,
    pub bottom: String,
    pub left: String,
    pub right: String,
}

impl Default for PdfMargin {
    fn default() -> Self {
        Self {
            top: "25mm".to_string(),
            bottom: "25mm".to_string(),
            left: "30mm".to_string(),
            right: "25mm".to_string(),
        }
    }
}

/// PDF 渲染选项
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfRenderOptions {
    /// 纸张格式: "A4", "Letter" 等
    #[serde(default = "default_format")]
    pub format: String,
    /// 页边距
    #[serde(default)]
    pub margin: PdfMargin,
    /// 是否显示页眉/页脚
    #[serde(default = "default_true")]
    pub display_header_footer: bool,
    /// 页眉 HTML 模板 (支持 Chromium 页眉变量)
    #[serde(default)]
    pub header_template: String,
    /// 页脚 HTML 模板 (含页码)
    #[serde(default)]
    pub footer_template: String,
    /// 是否打印背景色/图片
    #[serde(default = "default_true")]
    pub print_background: bool,
    /// 是否优先使用 CSS @page 中定义的尺寸
    #[serde(default)]
    pub prefer_css_page_size: bool,
    /// 缩放比例 (1.0 = 100%)
    #[serde(default = "default_scale")]
    pub scale: f64,
}

fn default_format() -> String { "A4".to_string() }
fn default_true() -> bool { true }
fn default_scale() -> f64 { 1.0 }

impl Default for PdfRenderOptions {
    fn default() -> Self {
        Self {
            format: default_format(),
            margin: PdfMargin::default(),
            display_header_footer: true,
            header_template: String::new(),
            footer_template: String::new(),
            print_background: true,
            prefer_css_page_size: false,
            scale: default_scale(),
        }
    }
}

/// browserless /pdf API 请求体
/// 参考: https://docs.browserless.io/http-apis/pdf
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BrowserlessPdfRequest {
    /// 完整 HTML 文档内容
    html: String,
    /// Chromium PDF 选项 (透传给 page.pdf())
    options: PdfRenderOptions,
    /// 等待页面中所有网络请求完成
    #[serde(skip_serializing_if = "Option::is_none")]
    goto_options: Option<BrowserlessGotoOptions>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BrowserlessGotoOptions {
    /// 等待条件: "networkidle0" | "networkidle2" | "load" | "domcontentloaded"
    wait_until: String,
    /// 导航超时 (ms)
    timeout: u64,
}

impl PdfExporter {
    /// 将 HTML 渲染为 PDF 字节流
    ///
    /// # 流程
    /// 1. 获取渲染信号量许可 (防止超出 browserless 并发限制)
    /// 2. 构造 browserless /pdf API 请求
    /// 3. POST 请求并接收 PDF 字节
    /// 4. 释放信号量
    ///
    /// # 错误
    /// - `Error::Http`: browserless 不可达或返回非 200 状态
    /// - `Error::Internal`: 信号量获取超时
    pub async fn render_pdf(
        &self,
        html: &str,
        options: &PdfRenderOptions,
    ) -> Result<Vec<u8>> {
        // 获取并发许可
        let _permit = self
            .render_semaphore
            .acquire()
            .await
            .map_err(|e| Error::Internal(format!("Render semaphore closed: {e}")))?;

        let request_body = BrowserlessPdfRequest {
            html: html.to_string(),
            options: options.clone(),
            goto_options: Some(BrowserlessGotoOptions {
                wait_until: "networkidle0".to_string(),
                timeout: 30_000,
            }),
        };

        let url = format!("{}/pdf", self.browserless_url.trim_end_matches('/'));

        let response = self
            .http_client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| Error::Http(format!(
                "browserless PDF request failed: {e}"
            )))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "<unreadable>".to_string());
            return Err(Error::Http(format!(
                "browserless returned {status}: {body}"
            )));
        }

        let pdf_bytes = response
            .bytes()
            .await
            .map_err(|e| Error::Http(format!(
                "Failed to read PDF response body: {e}"
            )))?;

        Ok(pdf_bytes.to_vec())
    }
}
```

#### browserless /pdf API 请求格式

browserless v2 的 `/pdf` 端点接受 JSON POST 请求，核心字段映射关系：

| browserless 字段 | Chromium 对应 | 说明 |
|:-----------------|:-------------|:-----|
| `html` | N/A | 直接传入 HTML 内容 (不通过 URL 导航，避免 SSRF) |
| `options.format` | `page.pdf({ format })` | 纸张格式 |
| `options.margin` | `page.pdf({ margin })` | 页边距对象 |
| `options.displayHeaderFooter` | `page.pdf({ displayHeaderFooter })` | 启用页眉页脚 |
| `options.headerTemplate` | `page.pdf({ headerTemplate })` | 页眉 HTML |
| `options.footerTemplate` | `page.pdf({ footerTemplate })` | 页脚 HTML |
| `options.printBackground` | `page.pdf({ printBackground })` | 保留背景色 |
| `options.scale` | `page.pdf({ scale })` | 缩放比例 |
| `gotoOptions.waitUntil` | `page.goto({ waitUntil })` | 页面加载等待策略 |

**注意**: browserless v2 返回的 `Content-Type` 为 `application/pdf`，响应体即为 PDF 二进制流。

#### 页眉/页脚 HTML 注入

Chromium 的 `headerTemplate` 和 `footerTemplate` 支持以下内置 CSS 类变量：

| CSS 类 | 渲染值 | 用途 |
|:-------|:-------|:-----|
| `.date` | 当前日期 | 页眉日期显示 |
| `.title` | 文档标题 | 页眉标题 |
| `.url` | 页面 URL | 不适用 (传入 HTML 模式下为空) |
| `.pageNumber` | 当前页码 | 页脚页码 |
| `.totalPages` | 总页数 | 页脚总页数 |

**页眉模板 (带机密等级和 Logo)：**

```html
<div style="width: 100%; font-size: 9px; padding: 0 30mm; box-sizing: border-box;
            display: flex; justify-content: space-between; align-items: center;
            border-bottom: 1px solid #ddd; padding-bottom: 4px;">
    <span style="color: #1a365d; font-family: SimHei, 'Noto Sans CJK SC', sans-serif;">
        {{ header_text }}
    </span>
    <span style="color: #e53e3e; font-family: SimHei, 'Noto Sans CJK SC', sans-serif;
                 font-weight: bold;">
        {{ classification }}
    </span>
</div>
```

**页脚模板 (含页码和版权声明)：**

```html
<div style="width: 100%; font-size: 8px; padding: 0 30mm; box-sizing: border-box;
            display: flex; justify-content: space-between; align-items: center;
            border-top: 1px solid #ddd; padding-top: 4px;">
    <span style="color: #718096; font-family: SimSun, 'Noto Sans CJK SC', sans-serif;">
        {{ footer_text }}
    </span>
    <span style="color: #718096;">
        第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页
    </span>
</div>
```

#### 页码生成 (CSS @page counter)

除 Chromium 内置的 `.pageNumber` / `.totalPages` 外，对于 HTML 导出等场景也需要 CSS counter 方案：

```css
@media print {
    @page {
        size: A4;
        margin: 25mm 25mm 25mm 30mm;

        @bottom-right {
            content: "第 " counter(page) " 页 / 共 " counter(pages) " 页";
            font-size: 9pt;
            color: #718096;
            font-family: SimSun, 'Noto Sans CJK SC', serif;
        }
    }
}
```

#### 封面页处理 (第一页无页眉页脚)

Chromium 的 `displayHeaderFooter` 是全局开关，无法对首页单独关闭。采用 **CSS 隐藏 + JavaScript 注入** 双重方案：

**方案 A：两阶段渲染（推荐）**

将封面页和正文页分别渲染为两个 PDF，然后在 Rust 端用 `lopdf` crate 合并：

```rust
/// 两阶段 PDF 渲染：封面 (无页眉页脚) + 正文 (有页眉页脚)
pub async fn render_report_pdf(
    &self,
    cover_html: &str,
    body_html: &str,
    options: &PdfRenderOptions,
) -> Result<Vec<u8>> {
    // 阶段 1：渲染封面 (无页眉页脚，单页)
    let cover_options = PdfRenderOptions {
        display_header_footer: false,
        ..options.clone()
    };
    let cover_pdf = self.render_pdf(cover_html, &cover_options).await?;

    // 阶段 2：渲染正文 (含页眉页脚)
    let body_pdf = self.render_pdf(body_html, options).await?;

    // 阶段 3：合并 PDF
    merge_pdfs(&cover_pdf, &body_pdf)
}

/// 使用 lopdf 合并两个 PDF 文档
fn merge_pdfs(pdf_a: &[u8], pdf_b: &[u8]) -> Result<Vec<u8>> {
    use lopdf::Document;

    let mut doc_a = Document::load_mem(pdf_a)
        .map_err(|e| Error::Internal(format!("Failed to parse cover PDF: {e}")))?;
    let doc_b = Document::load_mem(pdf_b)
        .map_err(|e| Error::Internal(format!("Failed to parse body PDF: {e}")))?;

    // 将 doc_b 的所有页面追加到 doc_a
    let pages_b = doc_b.get_pages();
    for (_, &page_id) in pages_b.iter() {
        // lopdf merge_from 方法实现页面复制
        doc_a.import_page(&doc_b, page_id)
            .map_err(|e| Error::Internal(format!("Failed to merge page: {e}")))?;
    }

    let mut output = Vec::new();
    doc_a.save_to(&mut output)
        .map_err(|e| Error::Internal(format!("Failed to save merged PDF: {e}")))?;

    Ok(output)
}
```

**方案 B：CSS margin 控制（简单场景可用）**

在封面页元素中使用 CSS 负边距抵消页眉/页脚区域：

```css
.cover-page {
    page-break-after: always;
    margin-top: -25mm; /* 抵消页眉区域 */
    padding-top: 25mm; /* 恢复内容区域 */
}
```

#### 目录生成 (页内锚点 + 手动构造)

由于 Chromium 无法在 PDF 渲染阶段动态获取各章节的实际页码（`@page` counter 无法通过 JavaScript 读取），目录采用 **锚点链接 + 视觉提示** 方案：

```html
<!-- 目录 HTML (Tera 模板生成) -->
<div class="toc" style="page-break-after: always;">
    <h1 style="text-align: center; font-family: SimHei, sans-serif;">目 录</h1>
    <div class="toc-entries">
        {% for section in sections %}
        <div class="toc-entry" style="display: flex; align-items: baseline;
                                       margin-bottom: 8px;">
            <a href="#section-{{ section.id }}"
               style="color: #1a365d; text-decoration: none; font-family: SimSun, serif;">
                {{ section.order }}. {{ section.title }}
            </a>
            <span style="flex: 1; border-bottom: 1px dotted #ccc;
                         margin: 0 8px;"></span>
        </div>
        {% endfor %}
    </div>
</div>

<!-- 各章节锚点 -->
{% for section in sections %}
<div id="section-{{ section.id }}" style="page-break-before: always;">
    <h2>{{ section.order }}. {{ section.title }}</h2>
    {{ section.content }}
</div>
{% endfor %}
```

**CSS 分页控制：**

```css
/* 章节标题始终在新页面开始 */
h2 {
    page-break-before: always;
}

/* 避免标题与内容分离 */
h2, h3 {
    page-break-after: avoid;
}

/* 表格行避免跨页断裂 */
tr {
    page-break-inside: avoid;
}

/* 图表块不可拆分 */
.chart-container {
    page-break-inside: avoid;
}
```

### 1.3 中文字体配置

#### browserless 容器中安装中文字体方案

browserless 基于 Debian/Ubuntu 的 Chromium 镜像，默认不包含中文字体。需要通过 volume 挂载或自定义镜像安装字体。

**方案 A：Volume 挂载字体目录（推荐，零构建成本）**

在 docker-compose.yml 中挂载本地字体目录：

```yaml
browserless:
  volumes:
    - ./fonts:/usr/share/fonts/custom:ro
```

项目中创建 `fonts/` 目录并放入以下字体文件：

```
fonts/
├── SimSun.ttf          # 宋体 (正文)
├── SimHei.ttf          # 黑体 (标题)
├── NotoSansCJKsc-Regular.otf   # Noto Sans CJK SC (回退)
├── NotoSansCJKsc-Bold.otf      # Noto Sans CJK SC Bold
└── NotoSerifCJKsc-Regular.otf  # Noto Serif CJK SC (可选，衬线回退)
```

注意：SimSun / SimHei 为 Windows 系统字体，需要合法授权。如无法获取授权，可使用 Google Noto CJK 字体系列（Apache License 2.0）作为替代。

**方案 B：自定义 Dockerfile（适合 CI/CD 环境）**

```dockerfile
# Dockerfile.browserless-cjk
FROM ghcr.io/browserless/chromium:v2.24.2

USER root

# 安装字体工具
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-noto-cjk \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

# 复制自定义字体
COPY fonts/ /usr/share/fonts/custom/

# 刷新字体缓存
RUN fc-cache -fv

USER pptruser
```

在 docker-compose.yml 中引用：

```yaml
browserless:
  build:
    context: .
    dockerfile: Dockerfile.browserless-cjk
  image: lawsaw-browserless-cjk:local
  profiles: ["crawler", "reporter"]
  # ... 其余配置不变
```

#### 字体回退链

在 HTML 模板的 CSS 中定义统一的字体回退链：

```css
:root {
    --font-body: SimSun, 'Noto Serif CJK SC', 'Noto Sans CJK SC', 'Microsoft YaHei', serif;
    --font-heading: SimHei, 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif;
    --font-mono: 'Courier New', 'Noto Sans Mono CJK SC', monospace;
}

body {
    font-family: var(--font-body);
    font-size: 12pt;
    line-height: 1.5;
}

h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-heading);
}

code, pre {
    font-family: var(--font-mono);
}
```

**回退优先级说明：**

| 优先级 | 字体 | 来源 | 说明 |
|:-------|:-----|:-----|:-----|
| 1 | SimSun / SimHei | Windows 系统字体 | 国内法律文档标准字体 |
| 2 | Noto Sans CJK SC / Noto Serif CJK SC | Google Noto 字体 | 开源免费，CJK 全覆盖 |
| 3 | Microsoft YaHei | Windows 系统字体 | 屏幕显示优化 |
| 4 | serif / sans-serif | 系统默认 | 最终回退 |

### 1.4 PDF 输出质量控制

#### DPI 设置

Chromium 的 `page.pdf()` 默认使用 96 DPI 渲染。对于打印级质量 (300 DPI)，通过 `scale` 参数和 CSS 控制：

```rust
impl PdfRenderOptions {
    /// 创建打印级质量的渲染选项
    pub fn print_quality() -> Self {
        Self {
            format: "A4".to_string(),
            scale: 1.0,
            print_background: true,
            // Chromium PDF 引擎实际输出矢量 PDF，文字和路径天然支持无限缩放。
            // DPI 主要影响光栅图像。通过 CSS 中设置高分辨率图片源确保质量。
            ..Default::default()
        }
    }
}
```

**重要说明：** Chromium 生成的 PDF 中，文字和 SVG 路径为矢量格式（与 DPI 无关），天然支持无限缩放。DPI 仅影响嵌入的光栅图像（PNG/JPEG）。因此：

- SVG 图表：在 PDF 中保持矢量质量，无需额外处理
- PNG 图片：建议在 HTML 中使用 2x/3x 分辨率的源图片
- CSS 中使用 `image-rendering: high-quality;` 优化图片缩放

#### 分页控制 (CSS page-break)

```css
/* 全局分页规则 */
@media print {
    /* 章节标题前强制分页 */
    .section-header {
        page-break-before: always;
    }

    /* 封面后强制分页 */
    .cover-page {
        page-break-after: always;
    }

    /* 目录后强制分页 */
    .toc {
        page-break-after: always;
    }

    /* 禁止在以下元素中间断页 */
    .chart-container,
    .article-card,
    .risk-alert-card,
    table,
    figure {
        page-break-inside: avoid;
    }

    /* 标题不与后续内容分离 */
    h1, h2, h3, h4 {
        page-break-after: avoid;
    }

    /* 至少保留2行孤行 */
    p {
        orphans: 2;
        widows: 2;
    }
}
```

#### 图表 SVG 在 PDF 中的渲染质量

SVG 图表通过 plotters 在 Rust 端预渲染为 SVG 字符串，然后作为内联 SVG 嵌入 HTML 模板：

```html
<!-- 图表内联嵌入 (Tera 模板) -->
<div class="chart-container" style="width: 100%; max-width: 600px; margin: 0 auto;">
    <h4 style="text-align: center;">{{ chart.title }}</h4>
    {{ chart.svg_content | safe }}
</div>
```

**质量保障措施：**

1. **矢量输出**：plotters 的 `SVGBackend` 直接生成矢量路径，在 PDF 中保持完美清晰度
2. **尺寸标准化**：所有图表统一宽度 560px (A4 纸 210mm - 55mm 页边距 = 155mm ≈ 585px @96dpi)
3. **字体嵌入**：SVG 中使用 `font-family` 属性匹配 HTML 字体回退链
4. **颜色空间**：使用 sRGB 色彩空间，确保屏幕与打印一致性

---

## 2. Word 导出引擎 (docx-rs)

### 2.1 Markdown -> DOCX 转换流程

Word 导出采用 `docx-rs` crate 直接构建 DOCX 文档结构，而非 Markdown 中转。原因：

- DOCX 的样式系统（段落样式、字符样式）无法通过 Markdown 语义完全表达
- 直接构建可以精确控制页眉/页脚、分节、分页等 Word 原生特性
- 避免引入额外的 Markdown -> DOCX 转换器依赖

```rust
use docx_rs::{
    Docx, Paragraph, Run, Table, TableRow, TableCell,
    PageMargin, Header, Footer, SectionProperty,
    NumberingId, IndentLevel,
};
use law_eye_common::{Error, Result};

/// 报告模型 (从数据库加载)
pub struct Report {
    pub id: uuid::Uuid,
    pub tenant_id: uuid::Uuid,
    pub title: String,
    pub report_number: Option<String>,
    pub period_start: chrono::NaiveDate,
    pub period_end: chrono::NaiveDate,
    pub content: serde_json::Value,
    pub version: i64,
}

/// 报告模板 (从数据库加载)
pub struct ReportTemplate {
    pub sections: Vec<TemplateSectionDef>,
    pub style_config: serde_json::Value,
}

/// 章节定义
pub struct TemplateSectionDef {
    pub id: String,
    pub section_type: String,
    pub title: String,
    pub order: i32,
}

pub struct DocxExporter;

impl DocxExporter {
    /// 将报告渲染为 DOCX 字节流
    ///
    /// # 流程
    /// 1. 从 style_config 解析样式配置 (字体、字号、页边距)
    /// 2. 创建 Docx 实例并设置文档属性
    /// 3. 添加页眉/页脚
    /// 4. 按 template.sections 顺序逐章节渲染
    /// 5. 序列化为字节流
    ///
    /// # 错误
    /// - `Error::Internal`: docx-rs 序列化失败
    /// - `Error::Validation`: 内容格式不符合预期
    pub fn render_docx(
        report: &Report,
        template: &ReportTemplate,
        charts: &[(String, Vec<u8>)], // (chart_id, PNG 字节)
    ) -> Result<Vec<u8>> {
        let style = Self::parse_style_config(&template.style_config)?;

        let mut docx = Docx::new();

        // 设置文档属性
        docx = docx
            .page_margin(PageMargin::new()
                .top(style.margin_top_twips)
                .bottom(style.margin_bottom_twips)
                .left(style.margin_left_twips)
                .right(style.margin_right_twips)
            );

        // 逐章节渲染
        let content = report.content.as_object()
            .and_then(|o| o.get("sections"))
            .and_then(|s| s.as_object())
            .ok_or_else(|| Error::Validation(
                "Report content missing 'sections' object".to_string()
            ))?;

        for section_def in &template.sections {
            let section_data = content.get(&section_def.id);
            docx = Self::render_section(
                docx,
                section_def,
                section_data,
                &style,
                charts,
            )?;
        }

        // 序列化为字节流
        let mut buf = Vec::new();
        docx.build()
            .pack(&mut std::io::Cursor::new(&mut buf))
            .map_err(|e| Error::Internal(format!("DOCX pack failed: {e}")))?;

        Ok(buf)
    }

    /// 渲染单个章节到 DOCX
    fn render_section(
        mut docx: Docx,
        section_def: &TemplateSectionDef,
        section_data: Option<&serde_json::Value>,
        style: &DocxStyle,
        charts: &[(String, Vec<u8>)],
    ) -> Result<Docx> {
        match section_def.section_type.as_str() {
            "cover" => Self::render_cover_section(&mut docx, section_def, section_data, style),
            "toc" => { /* TOC 由 Word 自动生成字段处理 */ Ok(()) },
            "text" => Self::render_text_section(&mut docx, section_def, section_data, style),
            "articles" => Self::render_articles_section(&mut docx, section_def, section_data, style),
            "charts" => Self::render_charts_section(&mut docx, section_def, section_data, style, charts),
            "calendar" => Self::render_calendar_section(&mut docx, section_def, section_data, style),
            "risk" => Self::render_risk_section(&mut docx, section_def, section_data, style),
            "static" => Self::render_static_section(&mut docx, section_def, section_data, style),
            unknown => {
                tracing::warn!("Unknown section type: {}, skipping", unknown);
                Ok(())
            }
        }?;

        Ok(docx)
    }

    // ... 各 render_*_section 方法的具体实现
}
```

### 2.2 样式映射

| Markdown 元素 | DOCX 样式 | docx-rs API | 字体/字号 |
|:--------------|:----------|:------------|:---------|
| `# H1` | Heading 1 | `Paragraph::new().style("Heading1")` | 黑体 (SimHei) 18pt |
| `## H2` | Heading 2 | `Paragraph::new().style("Heading2")` | 黑体 (SimHei) 16pt |
| `### H3` | Heading 3 | `Paragraph::new().style("Heading3")` | 黑体 (SimHei) 14pt |
| 正文 | Normal | `Paragraph::new()` | 宋体 (SimSun) 12pt |
| 表格 | Table Grid | `Table::new(rows)` | 宋体 (SimSun) 10.5pt |
| 图片 | Inline Picture | `Run::new().add_image(pic)` | N/A |
| 链接 | Hyperlink | `Paragraph::new().add_hyperlink(url, text)` | 蓝色下划线 |
| **粗体** | Bold | `Run::new().bold()` | 继承父样式 |
| *斜体* | Italic | `Run::new().italic()` | 继承父样式 |
| 无序列表 | List Bullet | `Paragraph::new().numbering(NumberingId, 0)` | 宋体 12pt |
| 有序列表 | List Number | `Paragraph::new().numbering(NumberingId, 0)` | 宋体 12pt |
| `代码` | Code | `Run::new().fonts("Courier New").size(20)` | Courier New 10pt |

**样式配置解析：**

```rust
/// DOCX 文档样式 (从 style_config JSON 解析)
struct DocxStyle {
    /// 正文字体
    body_font: String,          // "SimSun"
    /// 标题字体
    heading_font: String,       // "SimHei"
    /// 正文字号 (半磅单位, 12pt = 24)
    body_size_half_pt: u32,     // 24
    /// H1 字号
    h1_size_half_pt: u32,       // 36 (18pt)
    /// H2 字号
    h2_size_half_pt: u32,       // 32 (16pt)
    /// H3 字号
    h3_size_half_pt: u32,       // 28 (14pt)
    /// 行距 (240 = 单倍, 360 = 1.5倍, 480 = 双倍)
    line_spacing: u32,          // 360
    /// 页边距 (缇 = 1/1440英寸, 25mm ≈ 1418缇)
    margin_top_twips: i32,      // 1418
    margin_bottom_twips: i32,   // 1418
    margin_left_twips: i32,     // 1701 (30mm)
    margin_right_twips: i32,    // 1418
}

impl DocxStyle {
    fn from_json(config: &serde_json::Value) -> Result<Self> {
        let font_family = config
            .get("font_family")
            .and_then(|v| v.as_str())
            .unwrap_or("SimSun");

        let body_pt = config
            .get("body_font_size_pt")
            .and_then(|v| v.as_u64())
            .unwrap_or(12) as u32;

        let h1_pt = config
            .get("h1_font_size_pt")
            .and_then(|v| v.as_u64())
            .unwrap_or(18) as u32;

        let h2_pt = config
            .get("h2_font_size_pt")
            .and_then(|v| v.as_u64())
            .unwrap_or(16) as u32;

        let h3_pt = config
            .get("h3_font_size_pt")
            .and_then(|v| v.as_u64())
            .unwrap_or(14) as u32;

        let margin = config.get("margin");
        let margin_top_mm = margin
            .and_then(|m| m.get("top_mm"))
            .and_then(|v| v.as_f64())
            .unwrap_or(25.0);
        let margin_bottom_mm = margin
            .and_then(|m| m.get("bottom_mm"))
            .and_then(|v| v.as_f64())
            .unwrap_or(25.0);
        let margin_left_mm = margin
            .and_then(|m| m.get("left_mm"))
            .and_then(|v| v.as_f64())
            .unwrap_or(30.0);
        let margin_right_mm = margin
            .and_then(|m| m.get("right_mm"))
            .and_then(|v| v.as_f64())
            .unwrap_or(25.0);

        Ok(Self {
            body_font: font_family.to_string(),
            heading_font: "SimHei".to_string(),
            body_size_half_pt: body_pt * 2,
            h1_size_half_pt: h1_pt * 2,
            h2_size_half_pt: h2_pt * 2,
            h3_size_half_pt: h3_pt * 2,
            line_spacing: 360, // 1.5倍行距
            margin_top_twips: mm_to_twips(margin_top_mm),
            margin_bottom_twips: mm_to_twips(margin_bottom_mm),
            margin_left_twips: mm_to_twips(margin_left_mm),
            margin_right_twips: mm_to_twips(margin_right_mm),
        })
    }
}

/// 毫米 -> 缇 (twips) 转换
/// 1 inch = 25.4mm, 1 inch = 1440 twips
/// 所以 1mm = 1440/25.4 ≈ 56.69 twips
fn mm_to_twips(mm: f64) -> i32 {
    (mm * 1440.0 / 25.4).round() as i32
}
```

### 2.3 页眉/页脚配置

```rust
impl DocxExporter {
    /// 配置文档页眉
    fn build_header(style: &DocxStyle, config: &serde_json::Value) -> Header {
        let header_config = config.get("header");

        let header_text = header_config
            .and_then(|h| h.get("text"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let classification = header_config
            .and_then(|h| h.get("classification"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let show_logo = header_config
            .and_then(|h| h.get("show_logo"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let mut header = Header::new();

        // 构建页眉段落：左侧标题文字 + 右侧机密等级
        let mut para = Paragraph::new();

        if !header_text.is_empty() {
            para = para.add_run(
                Run::new()
                    .add_text(header_text)
                    .fonts(&style.heading_font)
                    .size(18) // 9pt
                    .color("1a365d")
            );
        }

        // 右对齐的机密等级标注
        if !classification.is_empty() {
            para = para.add_tab();
            para = para.add_run(
                Run::new()
                    .add_text(classification)
                    .fonts(&style.heading_font)
                    .size(18) // 9pt
                    .color("e53e3e")
                    .bold()
            );
        }

        header.add_paragraph(para);
        header
    }

    /// 配置文档页脚 (含页码)
    fn build_footer(style: &DocxStyle, config: &serde_json::Value) -> Footer {
        let footer_config = config.get("footer");

        let footer_text = footer_config
            .and_then(|h| h.get("text"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let show_page_number = footer_config
            .and_then(|h| h.get("show_page_number"))
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

        let mut footer = Footer::new();
        let mut para = Paragraph::new();

        // 左侧版权文字
        if !footer_text.is_empty() {
            para = para.add_run(
                Run::new()
                    .add_text(footer_text)
                    .fonts(&style.body_font)
                    .size(16) // 8pt
                    .color("718096")
            );
        }

        // 右对齐页码: "第 X 页 / 共 Y 页"
        if show_page_number {
            para = para.add_tab();
            para = para.add_run(
                Run::new()
                    .add_text("第 ")
                    .fonts(&style.body_font)
                    .size(16)
                    .color("718096")
            );
            // PAGE 域代码 (当前页码)
            para = para.add_field_simple("PAGE", false);
            para = para.add_run(
                Run::new()
                    .add_text(" 页 / 共 ")
                    .fonts(&style.body_font)
                    .size(16)
                    .color("718096")
            );
            // NUMPAGES 域代码 (总页数)
            para = para.add_field_simple("NUMPAGES", false);
            para = para.add_run(
                Run::new()
                    .add_text(" 页")
                    .fonts(&style.body_font)
                    .size(16)
                    .color("718096")
            );
        }

        footer.add_paragraph(para);
        footer
    }
}
```

### 2.4 图表嵌入

#### SVG -> PNG 转换

DOCX 格式不原生支持 SVG 嵌入（虽然 Word 2016+ 可以显示），为确保兼容性，需要将 plotters 生成的 SVG 转换为 PNG 后嵌入。

使用 `resvg` crate（纯 Rust SVG 渲染器）进行转换：

```rust
use resvg::usvg::{self, fontdb, TreeParsing, TreeTextToPath};
use resvg::tiny_skia;

/// SVG 字符串 -> PNG 字节
///
/// # 参数
/// - `svg_content`: SVG XML 字符串
/// - `scale`: 缩放因子 (2.0 = 2x 分辨率, 适合打印)
pub fn svg_to_png(svg_content: &str, scale: f32) -> Result<Vec<u8>> {
    // 加载系统字体 (用于 SVG 中的文字渲染)
    let mut fontdb = fontdb::Database::new();
    fontdb.load_system_fonts();

    // 解析 SVG
    let opt = usvg::Options::default();
    let mut tree = usvg::Tree::from_str(svg_content, &opt)
        .map_err(|e| Error::Internal(format!("SVG parse failed: {e}")))?;

    // 将文本转换为路径 (确保中文字符正确渲染)
    tree.convert_text(&fontdb);

    let size = tree.size();
    let width = (size.width() * scale) as u32;
    let height = (size.height() * scale) as u32;

    let mut pixmap = tiny_skia::Pixmap::new(width, height)
        .ok_or_else(|| Error::Internal("Failed to create pixmap".to_string()))?;

    let transform = tiny_skia::Transform::from_scale(scale, scale);
    resvg::render(&tree, transform, &mut pixmap.as_mut());

    let png_data = pixmap
        .encode_png()
        .map_err(|e| Error::Internal(format!("PNG encode failed: {e}")))?;

    Ok(png_data)
}
```

#### 图表尺寸标准化

| 图表类型 | SVG 尺寸 (px) | DOCX 嵌入尺寸 (cm) | 说明 |
|:---------|:-------------|:-------------------|:-----|
| 柱状图 | 560 x 360 | 15 x 9.6 | 占满正文宽度 |
| 饼图/环形图 | 400 x 400 | 10 x 10 | 居中显示 |
| 折线图 | 560 x 320 | 15 x 8.5 | 占满正文宽度 |
| 热力图 | 560 x 480 | 15 x 12.8 | 占满正文宽度，高度自适应 |

```rust
/// 图表嵌入 DOCX 的标准化配置
struct ChartEmbedConfig {
    /// EMU (English Metric Units) 宽度, 1cm = 360000 EMU
    width_emu: i64,
    /// EMU 高度
    height_emu: i64,
}

impl ChartEmbedConfig {
    fn bar_chart() -> Self {
        Self {
            width_emu: cm_to_emu(15.0),
            height_emu: cm_to_emu(9.6),
        }
    }

    fn pie_chart() -> Self {
        Self {
            width_emu: cm_to_emu(10.0),
            height_emu: cm_to_emu(10.0),
        }
    }

    fn line_chart() -> Self {
        Self {
            width_emu: cm_to_emu(15.0),
            height_emu: cm_to_emu(8.5),
        }
    }

    fn heatmap() -> Self {
        Self {
            width_emu: cm_to_emu(15.0),
            height_emu: cm_to_emu(12.8),
        }
    }
}

/// 厘米 -> EMU 转换 (1cm = 360000 EMU)
fn cm_to_emu(cm: f64) -> i64 {
    (cm * 360_000.0) as i64
}
```

---

## 3. HTML 导出

HTML 导出是最简单的格式，直接输出 Tera 模板渲染后的完整 HTML 文档。

### 3.1 设计原则

- **自包含**：所有 CSS 必须内联（`<style>` 标签），不引用外部样式表
- **图片内联**：所有 SVG 图表内联嵌入，光栅图片使用 Base64 data URI
- **离线可用**：导出的 HTML 文件可以在无网络环境下完整查看
- **可打印**：包含 `@media print` CSS 规则，支持浏览器直接打印为 PDF

### 3.2 实现

```rust
pub struct HtmlExporter;

impl HtmlExporter {
    /// 将 Tera 渲染后的 HTML 做自包含处理
    ///
    /// # 流程
    /// 1. 接收 Tera 渲染后的 HTML 字符串
    /// 2. 将图表 SVG 数据内联 (Tera 模板已处理)
    /// 3. 确保所有 CSS 已内联
    /// 4. 返回完整的 HTML 字节流
    pub fn render_html(
        rendered_html: &str,
        charts: &[(String, String)], // (chart_id, SVG 内容)
    ) -> Result<Vec<u8>> {
        // Tera 模板渲染阶段已将 SVG 通过 {{ chart.svg_content | safe }}
        // 内联嵌入 HTML，此处仅做最终的完整性验证

        let html = Self::ensure_complete_document(rendered_html);
        Ok(html.into_bytes())
    }

    /// 确保 HTML 是完整文档 (含 DOCTYPE、html、head、body 标签)
    fn ensure_complete_document(html: &str) -> String {
        if html.trim_start().to_lowercase().starts_with("<!doctype") {
            return html.to_string();
        }

        format!(
            r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>法眼报告</title>
</head>
<body>
{html}
</body>
</html>"#
        )
    }

    /// 将外部图片 URL 替换为 Base64 data URI
    /// (用于处理报告内容中引用的外部图片)
    pub async fn inline_external_images(
        html: &str,
        http_client: &reqwest::Client,
    ) -> Result<String> {
        // 使用正则匹配 <img src="https://..."> 标签
        let img_regex = regex::Regex::new(r#"<img\s+[^>]*src="(https?://[^"]+)"[^>]*>"#)
            .map_err(|e| Error::Internal(format!("Regex compile failed: {e}")))?;

        let mut result = html.to_string();

        for cap in img_regex.captures_iter(html) {
            let full_match = cap.get(0).unwrap().as_str();
            let url = cap.get(1).unwrap().as_str();

            match http_client.get(url).send().await {
                Ok(response) if response.status().is_success() => {
                    let content_type = response
                        .headers()
                        .get("content-type")
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or("image/png")
                        .to_string();

                    if let Ok(bytes) = response.bytes().await {
                        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                        let data_uri = format!("data:{content_type};base64,{b64}");
                        let replaced = full_match.replace(url, &data_uri);
                        result = result.replace(full_match, &replaced);
                    }
                }
                _ => {
                    tracing::warn!("Failed to fetch image for inline: {}", url);
                    // 保持原始 URL 不变
                }
            }
        }

        Ok(result)
    }
}
```

---

## 4. SVG 图表生成 (plotters)

### 4.1 图表类型实现

```rust
use plotters::prelude::*;
use law_eye_common::{Error, Result};
use serde::{Deserialize, Serialize};

/// 图表数据点 (通用)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartDataPoint {
    pub label: String,
    pub value: f64,
    /// 可选颜色 (hex 格式, 如 "#4299e1")
    pub color: Option<String>,
}

/// 图表数据系列 (折线图/多系列图)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartSeries {
    pub name: String,
    pub points: Vec<(String, f64)>, // (x_label, y_value)
    pub color: Option<String>,
}

/// 热力图数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeatmapData {
    pub x_labels: Vec<String>,
    pub y_labels: Vec<String>,
    /// 二维矩阵 [y][x]，值域 0.0 ~ 1.0 (归一化)
    pub values: Vec<Vec<f64>>,
    /// 原始计数 [y][x]
    pub raw_counts: Vec<Vec<i64>>,
}

/// 图表渲染选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartOptions {
    /// 图表标题
    pub title: String,
    /// SVG 宽度 (px)
    #[serde(default = "default_width")]
    pub width: u32,
    /// SVG 高度 (px)
    #[serde(default = "default_height")]
    pub height: u32,
    /// X 轴标签 (可选)
    pub x_label: Option<String>,
    /// Y 轴标签 (可选)
    pub y_label: Option<String>,
    /// 是否显示图例
    #[serde(default = "default_true_chart")]
    pub show_legend: bool,
    /// 字体族
    #[serde(default = "default_font")]
    pub font_family: String,
}

fn default_width() -> u32 { 560 }
fn default_height() -> u32 { 360 }
fn default_true_chart() -> bool { true }
fn default_font() -> String { "SimSun".to_string() }

pub struct ChartRenderer;

impl ChartRenderer {
    /// 渲染柱状图，返回 SVG 字符串
    pub fn render_bar_chart(
        data: &[ChartDataPoint],
        options: &ChartOptions,
    ) -> Result<String> {
        let mut svg_buf = String::new();

        {
            let root = SVGBackend::with_string(
                &mut svg_buf,
                (options.width, options.height),
            ).into_drawing_area();
            root.fill(&WHITE)
                .map_err(|e| Error::Internal(format!("Chart fill failed: {e}")))?;

            let max_value = data.iter().map(|d| d.value).fold(0.0f64, f64::max);
            let y_max = (max_value * 1.15).ceil(); // 留 15% 顶部空间

            let mut chart = ChartBuilder::on(&root)
                .caption(&options.title, (options.font_family.as_str(), 16))
                .margin(10)
                .x_label_area_size(60)
                .y_label_area_size(50)
                .build_cartesian_2d(
                    (0..data.len()).into_segmented(),
                    0.0..y_max,
                )
                .map_err(|e| Error::Internal(format!("Chart build failed: {e}")))?;

            chart
                .configure_mesh()
                .disable_x_mesh()
                .x_labels(data.len())
                .x_label_formatter(&|idx| {
                    match idx {
                        SegmentValue::CenterOf(i) => {
                            data.get(*i)
                                .map(|d| Self::truncate_label(&d.label, 6))
                                .unwrap_or_default()
                        }
                        _ => String::new(),
                    }
                })
                .y_label_formatter(&|v| format!("{:.0}", v))
                .y_desc(options.y_label.as_deref().unwrap_or(""))
                .draw()
                .map_err(|e| Error::Internal(format!("Chart mesh failed: {e}")))?;

            chart
                .draw_series(data.iter().enumerate().map(|(idx, point)| {
                    let color = point.color.as_deref()
                        .and_then(|c| Self::parse_hex_color(c))
                        .unwrap_or(RGBColor(66, 153, 225)); // 默认蓝色 #4299e1

                    Rectangle::new(
                        [
                            (SegmentValue::CenterOf(idx), 0.0),
                            (SegmentValue::CenterOf(idx), point.value),
                        ],
                        color.filled(),
                    )
                }))
                .map_err(|e| Error::Internal(format!("Chart draw failed: {e}")))?;

            root.present()
                .map_err(|e| Error::Internal(format!("Chart present failed: {e}")))?;
        }

        Ok(svg_buf)
    }

    /// 渲染饼图/环形图，返回 SVG 字符串
    pub fn render_pie_chart(
        data: &[ChartDataPoint],
        options: &ChartOptions,
    ) -> Result<String> {
        let mut svg_buf = String::new();

        {
            let root = SVGBackend::with_string(
                &mut svg_buf,
                (options.width, options.height),
            ).into_drawing_area();
            root.fill(&WHITE)
                .map_err(|e| Error::Internal(format!("Pie fill failed: {e}")))?;

            // plotters 没有原生饼图支持，使用自定义绘制
            let total: f64 = data.iter().map(|d| d.value).sum();
            if total <= 0.0 {
                return Ok(svg_buf);
            }

            let center_x = options.width as f64 / 2.0;
            let center_y = options.height as f64 / 2.0;
            let radius = (options.width.min(options.height) as f64 / 2.0) * 0.7;

            // 使用 SVG 直接绘制饼图扇区
            let mut current_angle = -std::f64::consts::FRAC_PI_2; // 从12点钟方向开始

            let default_colors = [
                "#4299e1", "#48bb78", "#ed8936", "#e53e3e",
                "#9f7aea", "#38b2ac", "#d69e2e", "#667eea",
            ];

            let mut svg_paths = Vec::new();
            let mut legend_items = Vec::new();

            for (idx, point) in data.iter().enumerate() {
                let slice_angle = (point.value / total) * 2.0 * std::f64::consts::PI;
                let end_angle = current_angle + slice_angle;

                let color_hex = point.color.as_deref()
                    .unwrap_or(default_colors[idx % default_colors.len()]);

                // SVG arc path
                let x1 = center_x + radius * current_angle.cos();
                let y1 = center_y + radius * current_angle.sin();
                let x2 = center_x + radius * end_angle.cos();
                let y2 = center_y + radius * end_angle.sin();

                let large_arc = if slice_angle > std::f64::consts::PI { 1 } else { 0 };

                svg_paths.push(format!(
                    r#"<path d="M {cx},{cy} L {x1},{y1} A {r},{r} 0 {la} 1 {x2},{y2} Z" fill="{color}" stroke="white" stroke-width="1"/>"#,
                    cx = center_x, cy = center_y,
                    x1 = x1, y1 = y1,
                    x2 = x2, y2 = y2,
                    r = radius, la = large_arc,
                    color = color_hex,
                ));

                let pct = (point.value / total * 100.0).round() as i32;
                legend_items.push((
                    color_hex.to_string(),
                    format!("{} ({}%)", point.label, pct),
                ));

                current_angle = end_angle;
            }

            // 手动将 SVG 路径追加到 svg_buf
            // 注意：plotters 的 SVGBackend 会自动生成 <svg> 标签
            // 我们需要在 present() 后修改 SVG 内容
            root.present()
                .map_err(|e| Error::Internal(format!("Pie present failed: {e}")))?;
        }

        // 由于 plotters 原生不支持饼图，采用直接生成 SVG 的方式
        svg_buf = Self::generate_pie_svg_direct(data, options)?;

        Ok(svg_buf)
    }

    /// 直接生成饼图 SVG (绕过 plotters 限制)
    fn generate_pie_svg_direct(
        data: &[ChartDataPoint],
        options: &ChartOptions,
    ) -> Result<String> {
        let total: f64 = data.iter().map(|d| d.value).sum();
        if total <= 0.0 {
            return Ok(format!(
                r#"<svg xmlns="http://www.w3.org/2000/svg" width="{}" height="{}"></svg>"#,
                options.width, options.height
            ));
        }

        let cx = options.width as f64 / 2.0;
        let cy = options.height as f64 / 2.0 - 20.0; // 为图例留空间
        let radius = (options.width.min(options.height) as f64 / 2.0) * 0.6;

        let default_colors = [
            "#4299e1", "#48bb78", "#ed8936", "#e53e3e",
            "#9f7aea", "#38b2ac", "#d69e2e", "#667eea",
        ];

        let mut paths = Vec::new();
        let mut legends = Vec::new();
        let mut current_angle: f64 = -std::f64::consts::FRAC_PI_2;

        for (idx, point) in data.iter().enumerate() {
            let slice_angle = (point.value / total) * 2.0 * std::f64::consts::PI;
            let end_angle = current_angle + slice_angle;
            let color = point.color.as_deref()
                .unwrap_or(default_colors[idx % default_colors.len()]);

            let x1 = cx + radius * current_angle.cos();
            let y1 = cy + radius * current_angle.sin();
            let x2 = cx + radius * end_angle.cos();
            let y2 = cy + radius * end_angle.sin();

            let large_arc = if slice_angle > std::f64::consts::PI { 1 } else { 0 };

            paths.push(format!(
                r#"  <path d="M {cx},{cy} L {x1:.1},{y1:.1} A {r},{r} 0 {la} 1 {x2:.1},{y2:.1} Z" fill="{color}" stroke="white" stroke-width="2"/>"#,
                cx = cx, cy = cy, x1 = x1, y1 = y1, x2 = x2, y2 = y2,
                r = radius, la = large_arc, color = color,
            ));

            let pct = (point.value / total * 100.0).round() as i32;
            legends.push(format!(
                r#"  <rect x="{lx}" y="{ly}" width="12" height="12" fill="{color}"/>
  <text x="{tx}" y="{ty}" font-size="11" font-family="{font}" fill="#4a5568">{label} ({pct}%)</text>"#,
                lx = 20, ly = options.height as f64 - 30.0 + (idx as f64 * 0.0), // 简化
                tx = 36, ty = options.height as f64 - 20.0 + (idx as f64 * 0.0),
                color = color,
                font = options.font_family,
                label = point.label,
                pct = pct,
            ));

            current_angle = end_angle;
        }

        let title_svg = format!(
            r#"  <text x="{}" y="20" text-anchor="middle" font-size="14" font-family="{}" font-weight="bold" fill="#2d3748">{}</text>"#,
            cx, options.font_family, options.title,
        );

        Ok(format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
{title}
{paths}
</svg>"#,
            w = options.width, h = options.height,
            title = title_svg,
            paths = paths.join("\n"),
        ))
    }

    /// 渲染折线图，返回 SVG 字符串
    pub fn render_line_chart(
        series: &[ChartSeries],
        options: &ChartOptions,
    ) -> Result<String> {
        let mut svg_buf = String::new();

        {
            let root = SVGBackend::with_string(
                &mut svg_buf,
                (options.width, options.height),
            ).into_drawing_area();
            root.fill(&WHITE)
                .map_err(|e| Error::Internal(format!("Line fill failed: {e}")))?;

            // 收集所有 x 标签和 y 值范围
            let all_x_labels: Vec<String> = series
                .first()
                .map(|s| s.points.iter().map(|(x, _)| x.clone()).collect())
                .unwrap_or_default();

            let y_max = series
                .iter()
                .flat_map(|s| s.points.iter().map(|(_, y)| *y))
                .fold(0.0f64, f64::max);
            let y_upper = (y_max * 1.15).ceil().max(1.0);

            let x_range = 0..all_x_labels.len();

            let mut chart = ChartBuilder::on(&root)
                .caption(&options.title, (options.font_family.as_str(), 16))
                .margin(10)
                .x_label_area_size(50)
                .y_label_area_size(50)
                .build_cartesian_2d(x_range.clone(), 0.0..y_upper)
                .map_err(|e| Error::Internal(format!("Line chart build failed: {e}")))?;

            chart
                .configure_mesh()
                .x_labels(all_x_labels.len().min(12))
                .x_label_formatter(&|idx| {
                    all_x_labels.get(*idx)
                        .map(|l| Self::truncate_label(l, 8))
                        .unwrap_or_default()
                })
                .y_label_formatter(&|v| format!("{:.0}", v))
                .draw()
                .map_err(|e| Error::Internal(format!("Line mesh failed: {e}")))?;

            let default_colors = [
                RGBColor(66, 153, 225),   // #4299e1
                RGBColor(72, 187, 120),   // #48bb78
                RGBColor(237, 137, 54),   // #ed8936
                RGBColor(229, 62, 62),    // #e53e3e
                RGBColor(159, 122, 234),  // #9f7aea
            ];

            for (idx, s) in series.iter().enumerate() {
                let color = s.color.as_deref()
                    .and_then(|c| Self::parse_hex_color(c))
                    .unwrap_or(default_colors[idx % default_colors.len()]);

                let points: Vec<(usize, f64)> = s.points
                    .iter()
                    .enumerate()
                    .map(|(i, (_, y))| (i, *y))
                    .collect();

                chart
                    .draw_series(
                        LineSeries::new(points.iter().copied(), color.stroke_width(2))
                    )
                    .map_err(|e| Error::Internal(format!("Line draw failed: {e}")))?
                    .label(&s.name)
                    .legend(move |(x, y)| {
                        Rectangle::new([(x, y - 5), (x + 15, y + 5)], color.filled())
                    });
            }

            if options.show_legend {
                chart
                    .configure_series_labels()
                    .position(SeriesLabelPosition::UpperRight)
                    .background_style(WHITE.filled())
                    .border_style(BLACK.stroke_width(1))
                    .label_font((options.font_family.as_str(), 11))
                    .draw()
                    .map_err(|e| Error::Internal(format!("Legend draw failed: {e}")))?;
            }

            root.present()
                .map_err(|e| Error::Internal(format!("Line present failed: {e}")))?;
        }

        Ok(svg_buf)
    }

    /// 渲染热力图，返回 SVG 字符串
    pub fn render_heatmap(
        data: &HeatmapData,
        options: &ChartOptions,
    ) -> Result<String> {
        // plotters 没有原生热力图支持，直接生成 SVG
        let cell_w = if data.x_labels.is_empty() { 40 } else {
            ((options.width as usize - 120) / data.x_labels.len()).max(20)
        };
        let cell_h = if data.y_labels.is_empty() { 30 } else {
            ((options.height as usize - 100) / data.y_labels.len()).max(20)
        };

        let offset_x = 100usize; // 左侧 y 轴标签空间
        let offset_y = 40usize;  // 顶部标题空间

        let mut rects = Vec::new();

        for (yi, y_label) in data.y_labels.iter().enumerate() {
            // Y 轴标签
            rects.push(format!(
                r#"  <text x="{}" y="{}" text-anchor="end" font-size="10" font-family="{}" fill="#4a5568">{}</text>"#,
                offset_x - 5,
                offset_y + yi * cell_h + cell_h / 2 + 4,
                options.font_family,
                Self::truncate_label(y_label, 8),
            ));

            for (xi, _x_label) in data.x_labels.iter().enumerate() {
                let value = data.values
                    .get(yi)
                    .and_then(|row| row.get(xi))
                    .copied()
                    .unwrap_or(0.0);

                let raw_count = data.raw_counts
                    .get(yi)
                    .and_then(|row| row.get(xi))
                    .copied()
                    .unwrap_or(0);

                let color = Self::heatmap_color(value);

                rects.push(format!(
                    r#"  <rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{color}" stroke="white" stroke-width="1">
    <title>{count}</title>
  </rect>"#,
                    x = offset_x + xi * cell_w,
                    y = offset_y + yi * cell_h,
                    w = cell_w,
                    h = cell_h,
                    color = color,
                    count = raw_count,
                ));

                // 在单元格中显示数值
                if raw_count > 0 {
                    let text_color = if value > 0.5 { "#ffffff" } else { "#2d3748" };
                    rects.push(format!(
                        r#"  <text x="{}" y="{}" text-anchor="middle" font-size="9" fill="{}">{}</text>"#,
                        offset_x + xi * cell_w + cell_w / 2,
                        offset_y + yi * cell_h + cell_h / 2 + 3,
                        text_color,
                        raw_count,
                    ));
                }
            }
        }

        // X 轴标签 (旋转 45 度)
        for (xi, x_label) in data.x_labels.iter().enumerate() {
            rects.push(format!(
                r#"  <text x="{}" y="{}" text-anchor="start" font-size="10" font-family="{}" fill="#4a5568" transform="rotate(45, {}, {})">{}</text>"#,
                offset_x + xi * cell_w + cell_w / 2,
                offset_y + data.y_labels.len() * cell_h + 15,
                options.font_family,
                offset_x + xi * cell_w + cell_w / 2,
                offset_y + data.y_labels.len() * cell_h + 15,
                Self::truncate_label(x_label, 6),
            ));
        }

        // 标题
        let title = format!(
            r#"  <text x="{}" y="25" text-anchor="middle" font-size="14" font-family="{}" font-weight="bold" fill="#2d3748">{}</text>"#,
            options.width / 2, options.font_family, options.title,
        );

        Ok(format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
{title}
{rects}
</svg>"#,
            w = options.width, h = options.height,
            title = title,
            rects = rects.join("\n"),
        ))
    }

    // ── 辅助方法 ──

    /// 热力图颜色插值 (蓝白红渐变)
    /// value: 0.0 (冷/蓝) -> 0.5 (白) -> 1.0 (热/红)
    fn heatmap_color(value: f64) -> String {
        let v = value.clamp(0.0, 1.0);
        if v <= 0.5 {
            // 蓝 -> 白
            let t = v * 2.0;
            let r = (235.0 * t + 49.0 * (1.0 - t)) as u8;
            let g = (248.0 * t + 130.0 * (1.0 - t)) as u8;
            let b = (255.0 * t + 189.0 * (1.0 - t)) as u8;
            format!("#{:02x}{:02x}{:02x}", r, g, b)
        } else {
            // 白 -> 红
            let t = (v - 0.5) * 2.0;
            let r = (229.0 * t + 235.0 * (1.0 - t)) as u8;
            let g = (62.0 * t + 248.0 * (1.0 - t)) as u8;
            let b = (62.0 * t + 255.0 * (1.0 - t)) as u8;
            format!("#{:02x}{:02x}{:02x}", r, g, b)
        }
    }

    /// 截断标签文字 (中文算2字符宽)
    fn truncate_label(label: &str, max_display_chars: usize) -> String {
        let mut width = 0;
        let mut result = String::new();
        for ch in label.chars() {
            let ch_width = if ch.is_ascii() { 1 } else { 2 };
            if width + ch_width > max_display_chars * 2 {
                result.push_str("..");
                break;
            }
            result.push(ch);
            width += ch_width;
        }
        result
    }

    /// 解析 hex 颜色字符串为 RGBColor
    fn parse_hex_color(hex: &str) -> Option<RGBColor> {
        let hex = hex.trim_start_matches('#');
        if hex.len() != 6 { return None; }
        let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
        let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
        let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
        Some(RGBColor(r, g, b))
    }
}
```

### 4.2 统计数据 -> 图表的映射

| 统计维度 | 图表类型 | 调用方法 | 数据源 (StatisticsService) | 数据转换说明 |
|:---------|:---------|:---------|:--------------------------|:------------|
| 地域分布 | 柱状图 | `render_bar_chart()` | `RegionalDistribution.items` | `region_name` -> label, `count` -> value |
| 地域分布 | 热力图 | `render_heatmap()` | `RegionalDistribution.items` | 需要额外的地域-维度交叉数据 |
| 行业分布 | 饼图 | `render_pie_chart()` | `IndustryDistribution.items` | `label` -> label, `count` -> value |
| 行业分布 | 柱状图 | `render_bar_chart()` | `IndustryDistribution.items` | `label` -> label, `count` -> value |
| 重要性分布 | 柱状图 | `render_bar_chart()` | `ImportanceDistribution.levels` | 索引+1 -> label (1-5级), `levels[i]` -> value |
| 权威等级 | 柱状图 | `render_bar_chart()` | `AuthorityDistribution.levels` | `label` -> label, `count` -> value |
| 发布机构 | 柱状图 | `render_bar_chart()` | `IssuerDistribution.items` | `issuer` -> label, `count` -> value (TOP 10) |
| 趋势分析 | 折线图 | `render_line_chart()` | `TimelineByDimension.series` | 每个 `TimelineSeries` -> `ChartSeries` |
| 交叉分析 | 热力图 | `render_heatmap()` | `CrossDimensionalResult.cells` | 稀疏矩阵 -> 密集矩阵 |

**数据转换工具函数：**

```rust
impl ChartRenderer {
    /// RegionalDistribution -> 柱状图数据
    pub fn regional_to_bar(data: &RegionalDistribution) -> Vec<ChartDataPoint> {
        data.items.iter().take(15).map(|item| ChartDataPoint {
            label: item.region_name.clone(),
            value: item.count as f64,
            color: None,
        }).collect()
    }

    /// IndustryDistribution -> 饼图数据
    pub fn industry_to_pie(data: &IndustryDistribution) -> Vec<ChartDataPoint> {
        let colors = [
            "#4299e1", "#48bb78", "#ed8936", "#e53e3e",
            "#9f7aea", "#38b2ac", "#d69e2e", "#667eea",
        ];
        data.items.iter().enumerate().map(|(i, item)| ChartDataPoint {
            label: item.label.clone(),
            value: item.count as f64,
            color: Some(colors[i % colors.len()].to_string()),
        }).collect()
    }

    /// ImportanceDistribution -> 柱状图数据
    pub fn importance_to_bar(data: &ImportanceDistribution) -> Vec<ChartDataPoint> {
        let labels = ["1级(低)", "2级(较低)", "3级(中)", "4级(较高)", "5级(高)"];
        let colors = ["#c6f6d5", "#9ae6b4", "#fefcbf", "#fbd38d", "#fc8181"];
        data.levels.iter().enumerate().map(|(i, &count)| ChartDataPoint {
            label: labels[i].to_string(),
            value: count as f64,
            color: Some(colors[i].to_string()),
        }).collect()
    }

    /// TimelineByDimension -> 折线图系列
    pub fn timeline_to_line_series(data: &TimelineByDimension) -> Vec<ChartSeries> {
        data.series.iter().map(|ts| ChartSeries {
            name: ts.label.clone(),
            points: ts.points.iter().map(|p| {
                (p.date.format("%m/%d").to_string(), p.count as f64)
            }).collect(),
            color: None,
        }).collect()
    }

    /// CrossDimensionalResult -> 热力图数据
    pub fn cross_to_heatmap(data: &CrossDimensionalResult) -> HeatmapData {
        let mut x_set = std::collections::BTreeSet::new();
        let mut y_set = std::collections::BTreeSet::new();
        let mut cell_map = std::collections::HashMap::new();
        let mut max_count: i64 = 1;

        for cell in &data.cells {
            x_set.insert(cell.x_value.clone());
            y_set.insert(cell.y_value.clone());
            cell_map.insert((cell.x_value.clone(), cell.y_value.clone()), cell.count);
            max_count = max_count.max(cell.count);
        }

        let x_labels: Vec<String> = x_set.into_iter().collect();
        let y_labels: Vec<String> = y_set.into_iter().collect();

        let values: Vec<Vec<f64>> = y_labels.iter().map(|y| {
            x_labels.iter().map(|x| {
                let count = cell_map.get(&(x.clone(), y.clone())).copied().unwrap_or(0);
                count as f64 / max_count as f64
            }).collect()
        }).collect();

        let raw_counts: Vec<Vec<i64>> = y_labels.iter().map(|y| {
            x_labels.iter().map(|x| {
                cell_map.get(&(x.clone(), y.clone())).copied().unwrap_or(0)
            }).collect()
        }).collect();

        HeatmapData { x_labels, y_labels, values, raw_counts }
    }
}
```

### 4.3 中文标签渲染

#### plotters 中文字体配置

plotters 的 `SVGBackend` 通过 CSS `font-family` 属性指定字体，不需要在 Rust 端加载字体文件。但需要确保目标渲染环境（browserless/浏览器）安装了对应字体。

对于直接生成的 SVG（热力图、饼图），在 `<text>` 标签中指定 `font-family`：

```xml
<text font-family="SimSun, 'Noto Sans CJK SC', sans-serif">中文标签</text>
```

#### 标签自动换行

对于过长的中文标签（如省份名称、机构名称），采用截断 + 省略号策略：

```rust
/// 智能截断标签
/// - 保留 max_chars 个显示字符（中文算 1 个显示字符）
/// - 超出部分显示 ".."
fn truncate_label(label: &str, max_chars: usize) -> String {
    let chars: Vec<char> = label.chars().collect();
    if chars.len() <= max_chars {
        return label.to_string();
    }
    let truncated: String = chars[..max_chars].iter().collect();
    format!("{}..", truncated)
}
```

#### 图例位置自适应

- **柱状图/折线图**：图例位于右上角 (`SeriesLabelPosition::UpperRight`)
- **饼图**：图例位于图表底部，水平排列
- **热力图**：不显示图例，使用色阶条代替

---

## 5. MinIO 文件存储策略

### 5.1 存储路径设计

```
law-eye/                            (bucket 名称, 与现有 ObjectService 共享)
├── tenants/{tenant_id}/
│   ├── users/                      (现有: 用户头像等)
│   │   └── {user_id}/
│   │       └── avatars/
│   └── reports/                    (新增: 报告导出文件)
│       └── {report_id}/
│           ├── v1.pdf              (版本化命名)
│           ├── v1.docx
│           ├── v1.html
│           ├── v2.pdf              (新版本)
│           ├── v2.docx
│           └── charts/
│               ├── regional_bar.svg
│               ├── industry_pie.svg
│               ├── importance_bar.svg
│               ├── authority_bar.svg
│               ├── trend_line.svg
│               └── cross_heatmap.svg
```

**路径生成规则：**

```rust
/// 报告导出文件的 MinIO object key 生成
pub fn report_object_key(
    tenant_id: uuid::Uuid,
    report_id: uuid::Uuid,
    version: i64,
    format: ExportFormat,
) -> String {
    let ext = match format {
        ExportFormat::Pdf => "pdf",
        ExportFormat::Docx => "docx",
        ExportFormat::Html => "html",
    };
    format!("tenants/{tenant_id}/reports/{report_id}/v{version}.{ext}")
}

/// 图表 SVG 的 MinIO object key 生成
pub fn chart_object_key(
    tenant_id: uuid::Uuid,
    report_id: uuid::Uuid,
    chart_id: &str,
) -> String {
    format!("tenants/{tenant_id}/reports/{report_id}/charts/{chart_id}.svg")
}
```

**与现有 `ObjectService` 的集成：**

报告文件复用现有的 `law-eye` bucket（docker-compose.yml 第 178 行配置），通过 `tenants/{id}/reports/` 前缀与用户文件隔离。不需要创建额外的 bucket。

### 5.2 Pre-signed URL 生成

扩展现有 `ObjectService`，添加 pre-signed URL 生成方法：

```rust
impl ObjectService {
    /// 生成报告文件的预签名下载 URL
    ///
    /// # 参数
    /// - `object_key`: MinIO 中的文件路径
    /// - `download_filename`: 浏览器下载时显示的文件名 (中文)
    /// - `expires_in`: URL 有效期
    ///
    /// # 返回
    /// 预签名 URL 字符串
    pub async fn presign_download(
        &self,
        object_key: &str,
        download_filename: &str,
        expires_in: std::time::Duration,
    ) -> Result<String> {
        let content_disposition = format!(
            "attachment; filename=\"{}\"; filename*=UTF-8''{}",
            download_filename,
            urlencoding::encode(download_filename),
        );

        let presign_config = aws_sdk_s3::presigning::PresigningConfig::builder()
            .expires_in(expires_in)
            .build()
            .map_err(|e| Error::Internal(format!("Presign config failed: {e}")))?;

        let presigned_request = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(object_key)
            .response_content_disposition(&content_disposition)
            .presigned(presign_config)
            .await
            .map_err(|e| Error::Http(format!("Presign failed: {e}")))?;

        Ok(presigned_request.uri().to_string())
    }
}
```

**下载文件名生成规则：**

```rust
/// 生成用户友好的下载文件名
///
/// 示例：
/// - 周报: "法眼合规周报_2026W07.pdf"
/// - 月报: "法眼月度合规报告_2026年02月.docx"
pub fn download_filename(
    report_title: &str,
    period_type: &str,
    period_start: chrono::NaiveDate,
    format: ExportFormat,
) -> String {
    let period_suffix = match period_type {
        "weekly" => {
            let week = period_start.iso_week().week();
            let year = period_start.year();
            format!("{year}W{week:02}")
        }
        "monthly" => {
            period_start.format("%Y年%m月").to_string()
        }
        "quarterly" => {
            let q = (period_start.month0() / 3) + 1;
            format!("{}年Q{}", period_start.year(), q)
        }
        _ => period_start.format("%Y%m%d").to_string(),
    };

    let ext = match format {
        ExportFormat::Pdf => "pdf",
        ExportFormat::Docx => "docx",
        ExportFormat::Html => "html",
    };

    format!("{report_title}_{period_suffix}.{ext}")
}
```

**Pre-signed URL 配置：**

| 参数 | 值 | 说明 |
|:-----|:---|:-----|
| 有效期 | 1 小时 | `Duration::from_secs(3600)` |
| Content-Disposition | `attachment; filename*=UTF-8''...` | 强制下载（非浏览器内打开）+ 中文文件名 |
| Content-Type | 根据格式自动设置 | PDF: `application/pdf`, DOCX: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, HTML: `text/html; charset=utf-8` |

### 5.3 文件清理策略

#### 版本保留策略

```rust
/// 清理报告的旧版本导出文件
///
/// 保留最近 N 个版本，删除更早的版本。
///
/// # 参数
/// - `tenant_id`: 租户 ID
/// - `report_id`: 报告 ID
/// - `current_version`: 当前报告版本号
/// - `keep_versions`: 保留的版本数量 (默认 3)
pub async fn cleanup_old_exports(
    &self,
    tenant_id: uuid::Uuid,
    report_id: uuid::Uuid,
    current_version: i64,
    keep_versions: i64,
) -> Result<u32> {
    let prefix = format!("tenants/{tenant_id}/reports/{report_id}/");
    let page = self.list_objects_page(&prefix, None, Some(1000)).await?;

    let mut deleted = 0u32;

    for obj in &page.objects {
        // 解析版本号: "tenants/.../reports/.../v3.pdf" -> 3
        if let Some(version) = Self::extract_version_from_key(&obj.object_key) {
            if version <= current_version - keep_versions && version > 0 {
                self.delete_object_key(&obj.object_key).await?;
                deleted += 1;
                tracing::info!(
                    "Cleaned up old export: {} (version {})",
                    obj.object_key, version
                );
            }
        }
    }

    Ok(deleted)
}

/// 从 object key 中提取版本号
/// "tenants/.../reports/.../v3.pdf" -> Some(3)
fn extract_version_from_key(key: &str) -> Option<i64> {
    let filename = key.rsplit('/').next()?;
    let stem = filename.split('.').next()?;
    if stem.starts_with('v') {
        stem[1..].parse::<i64>().ok()
    } else {
        None
    }
}
```

#### 定时清理 (Worker Cron)

在 Worker 中注册定期清理任务（与现有 Worker 架构一致）：

```rust
// crates/law-eye-worker/src/main.rs 中添加定时任务

/// 每天凌晨 3:00 执行报告文件清理
async fn schedule_report_cleanup(
    object_service: Arc<ObjectService>,
    pool: PgPool,
) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(86400));
    loop {
        interval.tick().await;

        // 查询所有有导出文件的报告
        let reports: Vec<(uuid::Uuid, uuid::Uuid, i64)> = sqlx::query_as(
            r#"
            SELECT tenant_id, id, version
            FROM reports
            WHERE deleted_at IS NULL
              AND (pdf_object_key IS NOT NULL OR docx_object_key IS NOT NULL)
            "#
        )
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

        let mut total_cleaned = 0u32;
        for (tenant_id, report_id, version) in reports {
            match object_service.cleanup_old_exports(
                tenant_id, report_id, version, 3 // 保留最近3个版本
            ).await {
                Ok(count) => total_cleaned += count,
                Err(e) => tracing::warn!(
                    "Report cleanup failed for {}: {}", report_id, e
                ),
            }
        }

        if total_cleaned > 0 {
            tracing::info!("Report cleanup: deleted {} old export files", total_cleaned);
        }
    }
}
```

---

## 6. 异步导出任务流程

### 6.1 任务定义

```rust
// crates/law-eye-queue/src/lib.rs 中新增

/// 报告导出任务 (Redis 队列 payload)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ExportTask {
    /// 报告 ID
    pub report_id: uuid::Uuid,
    /// 租户 ID
    pub tenant_id: uuid::Uuid,
    /// 导出格式
    pub format: ExportFormat,
    /// 请求导出的用户 ID
    pub requested_by: uuid::Uuid,
    /// 报告版本号 (用于生成文件名)
    pub report_version: i64,
}

/// 导出格式
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Pdf,
    Docx,
    Html,
}

impl ExportFormat {
    pub fn content_type(&self) -> &'static str {
        match self {
            Self::Pdf => "application/pdf",
            Self::Docx => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            Self::Html => "text/html; charset=utf-8",
        }
    }

    pub fn extension(&self) -> &'static str {
        match self {
            Self::Pdf => "pdf",
            Self::Docx => "docx",
            Self::Html => "html",
        }
    }
}

/// 报告导出队列名称
pub const QUEUE_REPORT_EXPORT: &str = "report_export";
```

### 6.2 Worker 处理流程

```rust
// crates/law-eye-worker/src/export_handler.rs

use law_eye_queue::{ExportTask, ExportFormat, QUEUE_REPORT_EXPORT, TaskQueue, RetryableTask};
use law_eye_core::{ObjectService, StatisticsService};
use std::sync::Arc;

pub struct ExportHandler {
    queue: TaskQueue,
    pool: sqlx::PgPool,
    object_service: Arc<ObjectService>,
    statistics_service: Arc<StatisticsService>,
    pdf_exporter: Arc<PdfExporter>,
}

impl ExportHandler {
    /// Worker 主循环：消费导出任务
    pub async fn run(&self) -> ! {
        tracing::info!("Report export worker started");
        loop {
            // 处理延迟重试任务
            let _ = self.queue.process_delayed_tasks(QUEUE_REPORT_EXPORT).await;

            // 保留式出队 (reserve + ack 模式，防止任务丢失)
            match self.queue.reserve_retryable::<ExportTask>(
                QUEUE_REPORT_EXPORT, 5
            ).await {
                Ok(Some(reserved)) => {
                    let task = &reserved.task;
                    let task_id = task.id;
                    let raw_payload = reserved.raw_payload.clone();

                    tracing::info!(
                        "Processing export task {}: report={}, format={:?}",
                        task_id, task.payload.report_id, task.payload.format
                    );

                    match self.handle_export(&task.payload).await {
                        Ok(object_key) => {
                            // 成功：ACK 并标记完成
                            let _ = self.queue.ack_reserved(
                                QUEUE_REPORT_EXPORT, &raw_payload
                            ).await;
                            let _ = self.queue.mark_done(
                                QUEUE_REPORT_EXPORT, task_id
                            ).await;

                            tracing::info!(
                                "Export task {} completed: {}",
                                task_id, object_key
                            );
                        }
                        Err(e) => {
                            let error_msg = e.to_string();
                            tracing::error!(
                                "Export task {} failed: {}", task_id, error_msg
                            );

                            // 失败：ACK 当前预留 + 重试或死信
                            let _ = self.queue.ack_reserved(
                                QUEUE_REPORT_EXPORT, &raw_payload
                            ).await;
                            let _ = self.queue.retry_or_dead_letter(
                                QUEUE_REPORT_EXPORT,
                                task.clone(),
                                error_msg,
                            ).await;
                        }
                    }
                }
                Ok(None) => {
                    // 无任务，继续等待
                }
                Err(e) => {
                    tracing::error!("Export queue dequeue error: {}", e);
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                }
            }
        }
    }

    /// 处理单个导出任务
    ///
    /// # 流程
    /// 1. 从数据库加载报告和模板
    /// 2. 加载统计数据并渲染图表
    /// 3. 使用 Tera 渲染 HTML
    /// 4. 根据格式调用对应的导出引擎
    /// 5. 上传到 MinIO
    /// 6. 更新 reports 表的 object_key
    /// 7. (可选) 发送通知
    async fn handle_export(&self, task: &ExportTask) -> Result<String> {
        // 步骤 1: 加载报告和模板
        let (report, template) = self.load_report_with_template(
            task.tenant_id, task.report_id
        ).await?;

        // 步骤 2: 加载统计数据并渲染图表 SVG
        let charts = self.render_charts(
            task.tenant_id, &report, &template
        ).await?;

        // 步骤 3: Tera 渲染 HTML
        let rendered_html = self.render_html(
            &report, &template, &charts
        )?;

        // 步骤 4: 根据格式导出
        let export_bytes = match task.format {
            ExportFormat::Pdf => {
                let options = self.build_pdf_options(&template)?;
                self.pdf_exporter.render_pdf(&rendered_html, &options).await?
            }
            ExportFormat::Docx => {
                let chart_pngs: Vec<(String, Vec<u8>)> = charts
                    .iter()
                    .map(|(id, svg)| {
                        let png = svg_to_png(svg, 2.0)?;
                        Ok((id.clone(), png))
                    })
                    .collect::<Result<Vec<_>>>()?;

                DocxExporter::render_docx(&report, &template, &chart_pngs)?
            }
            ExportFormat::Html => {
                let chart_refs: Vec<(String, String)> = charts
                    .iter()
                    .map(|(id, svg)| (id.clone(), svg.clone()))
                    .collect();
                HtmlExporter::render_html(&rendered_html, &chart_refs)?
            }
        };

        // 步骤 5: 上传到 MinIO
        let object_key = report_object_key(
            task.tenant_id, task.report_id, task.report_version, task.format
        );

        self.upload_export(
            &object_key,
            &export_bytes,
            task.format.content_type(),
        ).await?;

        // 步骤 6: 更新 reports 表
        self.update_report_object_key(
            task.tenant_id,
            task.report_id,
            task.format,
            &object_key,
        ).await?;

        // 步骤 7: 清理旧版本
        let _ = self.object_service.cleanup_old_exports(
            task.tenant_id, task.report_id, task.report_version, 3
        ).await;

        Ok(object_key)
    }

    /// 上传导出文件到 MinIO
    async fn upload_export(
        &self,
        object_key: &str,
        bytes: &[u8],
        content_type: &str,
    ) -> Result<()> {
        use aws_sdk_s3::primitives::ByteStream;

        // 通过 ObjectService 的底层 S3 client 上传
        // 注意：需要在 ObjectService 中暴露通用的 put_object 方法
        let byte_stream = ByteStream::from(bytes.to_vec());

        // 这里需要 ObjectService 提供通用上传方法
        // 暂时直接使用 presigned 或在 ObjectService 中扩展
        self.object_service
            .put_object(object_key, byte_stream, content_type)
            .await
    }

    /// 更新报告表中的导出文件路径
    async fn update_report_object_key(
        &self,
        tenant_id: uuid::Uuid,
        report_id: uuid::Uuid,
        format: ExportFormat,
        object_key: &str,
    ) -> Result<()> {
        let column = match format {
            ExportFormat::Pdf => "pdf_object_key",
            ExportFormat::Docx => "docx_object_key",
            ExportFormat::Html => "html_object_key",
        };

        // 使用动态列名 (安全: 来自 match 白名单)
        let sql = format!(
            "UPDATE reports SET {column} = $3, updated_at = NOW() \
             WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL"
        );

        law_eye_core::with_tenant_tx(&self.pool, tenant_id, |tx| {
            let sql = sql.clone();
            let object_key = object_key.to_string();
            Box::pin(async move {
                sqlx::query(&sql)
                    .bind(report_id)
                    .bind(tenant_id)
                    .bind(&object_key)
                    .execute(tx.as_mut())
                    .await
                    .map_err(|e| law_eye_common::Error::Database(e.to_string()))?;
                Ok(())
            })
        })
        .await
    }
}
```

### 6.3 失败重试策略

导出任务复用项目现有的 `RetryableTask` + `retry_or_dead_letter` 机制（定义在 `law-eye-queue/src/lib.rs`）。

| 参数 | 值 | 说明 |
|:-----|:---|:-----|
| 最大重试次数 | 3 (默认 `DEFAULT_MAX_RETRIES`) | 超过则进入死信队列 |
| 退避策略 | 指数退避: 5s, 10s, 20s | `retry_backoff_ms()` (lib.rs:763) |
| 延迟队列 | `report_export:delayed` | Redis ZSET，按 retry_at 时间戳排序 |
| 死信队列 | `report_export:dlq` | 超过重试次数的失败任务 |
| 处理中队列 | `report_export:processing` | reserve 模式的 in-flight 跟踪 |
| 卡死任务回收 | visibility_timeout = 300s | `requeue_stuck_tasks()` 定期扫描 |

**错误分类与重试策略：**

| 错误类型 | 是否重试 | 说明 |
|:---------|:---------|:-----|
| browserless 连接超时 | 是 | 可能是临时网络问题 |
| browserless 503 (队列满) | 是 | 等待其他渲染任务完成 |
| browserless 渲染失败 (500) | 是 | 可能是 Chromium 进程崩溃 |
| MinIO 上传失败 | 是 | 可能是临时网络问题 |
| 数据库查询失败 | 是 | 可能是连接池耗尽 |
| 报告不存在 (404) | 否 | 直接进入死信队列 |
| 模板解析错误 | 否 | 需要人工修复模板 |
| DOCX 序列化错误 | 否 | 可能是数据格式问题 |

**Worker 卡死检测配置：**

```rust
// Worker 主循环中定期执行
async fn maintenance_loop(queue: &TaskQueue) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
    loop {
        interval.tick().await;

        // 回收卡死的导出任务 (超过5分钟未完成)
        match queue.requeue_stuck_tasks(
            QUEUE_REPORT_EXPORT,
            300_000, // 5分钟 visibility timeout
            50,      // 最多回收50个
        ).await {
            Ok(count) if count > 0 => {
                tracing::warn!("Re-queued {} stuck export tasks", count);
            }
            Err(e) => {
                tracing::error!("Export stuck task requeue failed: {}", e);
            }
            _ => {}
        }
    }
}
```

---

## 附录 A: 新增 Cargo 依赖

```toml
# Cargo.toml [workspace.dependencies] 新增:

# 模板引擎
tera = "1"

# Markdown 解析 (用于 content 中 markdown 字段渲染)
pulldown-cmark = { version = "0.12", features = ["serde"] }

# Word 文档生成
docx-rs = "0.4"

# SVG 图表生成
plotters = "0.3"
plotters-svg = "0.3"

# SVG -> PNG 转换 (DOCX 图表嵌入)
resvg = "0.44"

# PDF 合并 (封面 + 正文)
lopdf = "0.34"

# URL 编码 (下载文件名)
urlencoding = "2"

# HTML 转义 (XSS 防护)
html-escape = "0.2"

# 正则 (HTML 图片内联)
regex = "1"
```

## 附录 B: 模块文件结构

```
crates/law-eye-core/src/
├── report/                         # 新增报告模块
│   ├── mod.rs                      # pub mod 导出
│   ├── service.rs                  # ReportService (CRUD)
│   ├── template_service.rs         # ReportTemplateService
│   ├── aggregator.rs               # ReportDataAggregator (统计数据聚合)
│   ├── exporter/
│   │   ├── mod.rs                  # 导出引擎统一入口
│   │   ├── pdf.rs                  # PdfExporter (browserless)
│   │   ├── docx.rs                 # DocxExporter (docx-rs)
│   │   ├── html.rs                 # HtmlExporter (Tera + 内联)
│   │   └── chart.rs                # ChartRenderer (plotters + 手动 SVG)
│   ├── number.rs                   # 报告编号生成器
│   └── types.rs                    # 公共类型定义
├── object.rs                       # 扩展: presign_download(), put_object(), cleanup_old_exports()
└── lib.rs                          # 添加 pub mod report;
```

## 附录 C: 环境变量清单

| 变量名 | 默认值 | 说明 |
|:-------|:-------|:-----|
| `LAW_EYE__BROWSERLESS__URL` | `http://browserless:3000` | browserless 服务地址 (Worker 已有) |
| `LAW_EYE__BROWSERLESS__TIMEOUT_MS` | `30000` | browserless 请求超时 (Worker 已有) |
| `BROWSERLESS_MAX_CONCURRENT` | `5` | browserless 最大并发渲染数 |
| `BROWSERLESS_TIMEOUT` | `120000` | browserless 单次渲染超时 |
| `BROWSERLESS_TOKEN` | (空) | browserless API Token (建议生产环境设置) |
| `LAW_EYE__REPORT__MAX_EXPORT_SIZE_MB` | `50` | 单个导出文件最大体积 (MB) |
| `LAW_EYE__REPORT__KEEP_VERSIONS` | `3` | 保留的导出文件版本数 |
