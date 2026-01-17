use law_eye_ai::LlmGateway;
use law_eye_mcp::{JsonRpcRequest, McpServer};
use sqlx::postgres::PgPoolOptions;
use std::io::{BufRead, BufReader, Write};
use std::sync::Arc;
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 加载环境变量
    dotenvy::dotenv().ok();

    // 初始化日志（输出到 stderr 以免干扰 MCP 通信）
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "law_eye_mcp=info".into()),
        )
        .with(tracing_subscriber::fmt::layer().with_writer(std::io::stderr))
        .init();

    info!("Starting Law Eye MCP Server...");

    // 连接数据库
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;

    info!("Connected to database");

    // 创建 LLM Gateway
    let api_key = std::env::var("OPENAI_API_KEY").unwrap_or_default();
    let base_url = std::env::var("OPENAI_BASE_URL").ok();
    let gateway = Arc::new(LlmGateway::new(
        &api_key,
        base_url.as_deref(),
        None,
    ));

    // 创建 MCP 服务器
    let server = McpServer::new(pool, gateway);

    // 使用 stdio 进行 MCP 通信
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    let reader = BufReader::new(stdin.lock());

    info!("MCP Server ready, waiting for requests...");

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(e) => {
                error!("Failed to read line: {}", e);
                continue;
            }
        };

        if line.is_empty() {
            continue;
        }

        // 解析 JSON-RPC 请求
        let request: JsonRpcRequest = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                error!("Failed to parse request: {}", e);
                let error_response = serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": null,
                    "error": {
                        "code": -32700,
                        "message": format!("Parse error: {}", e)
                    }
                });
                writeln!(stdout, "{}", error_response)?;
                stdout.flush()?;
                continue;
            }
        };

        // 处理请求
        let response = server.handle_request(request).await;

        // 发送响应
        let response_json = serde_json::to_string(&response)?;
        writeln!(stdout, "{}", response_json)?;
        stdout.flush()?;
    }

    Ok(())
}
