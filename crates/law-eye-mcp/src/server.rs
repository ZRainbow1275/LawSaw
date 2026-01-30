use crate::protocol::*;
use law_eye_ai::LlmGateway;
use law_eye_core::{ArticleService, CategoryService, RagService};
use serde_json::{json, Value};
use sqlx::PgPool;
use std::sync::Arc;
use tracing::{error, info};
use uuid::Uuid;

pub struct McpServer {
    pool: PgPool,
    article_service: Arc<ArticleService>,
    category_service: Arc<CategoryService>,
    rag_service: Arc<RagService>,
}

impl McpServer {
    pub fn new(pool: PgPool, gateway: Arc<LlmGateway>) -> Self {
        Self {
            pool: pool.clone(),
            article_service: Arc::new(ArticleService::new(pool.clone())),
            category_service: Arc::new(CategoryService::new(pool.clone())),
            rag_service: Arc::new(RagService::new(pool, gateway)),
        }
    }

    async fn default_tenant_id(&self) -> Result<Uuid, String> {
        let row: (Uuid,) = sqlx::query_as("SELECT id FROM tenants WHERE slug = $1")
            .bind("default")
            .fetch_one(&self.pool)
            .await
            .map_err(|e| format!("Failed to load default tenant: {}", e))?;
        Ok(row.0)
    }

    pub async fn handle_request(&self, request: JsonRpcRequest) -> JsonRpcResponse {
        info!("Handling MCP request: {}", request.method);

        match request.method.as_str() {
            "initialize" => self.handle_initialize(request.id),
            "initialized" => JsonRpcResponse::success(request.id, json!({})),
            "tools/list" => self.handle_list_tools(request.id),
            "tools/call" => self.handle_call_tool(request.id, request.params).await,
            "resources/list" => self.handle_list_resources(request.id),
            "resources/read" => self.handle_read_resource(request.id, request.params).await,
            _ => JsonRpcResponse::error(request.id, -32601, "Method not found"),
        }
    }

    fn handle_initialize(&self, id: Option<Value>) -> JsonRpcResponse {
        let result = InitializeResult {
            protocol_version: "2024-11-05".to_string(),
            capabilities: ServerCapabilities {
                tools: Some(ToolsCapability {
                    list_changed: false,
                }),
                resources: Some(ResourcesCapability {
                    subscribe: false,
                    list_changed: false,
                }),
            },
            server_info: ServerInfo {
                name: "law-eye-mcp".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
            },
        };

        JsonRpcResponse::success(id, serde_json::to_value(result).unwrap())
    }

    fn handle_list_tools(&self, id: Option<Value>) -> JsonRpcResponse {
        let tools = vec![
            Tool {
                name: "search_articles".to_string(),
                description: "搜索法律资讯文章。支持关键词搜索，返回匹配的文章列表。".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "搜索关键词"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "返回结果数量限制，默认10",
                            "default": 10
                        }
                    },
                    "required": ["query"]
                }),
            },
            Tool {
                name: "semantic_search".to_string(),
                description: "语义搜索法律资讯。使用向量相似度进行语义匹配，适合复杂查询。"
                    .to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "查询文本"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "返回结果数量限制，默认5",
                            "default": 5
                        }
                    },
                    "required": ["query"]
                }),
            },
            Tool {
                name: "ask_question".to_string(),
                description: "基于知识库回答法律相关问题。使用 RAG 技术，结合相关文章生成答案。"
                    .to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "question": {
                            "type": "string",
                            "description": "要回答的问题"
                        },
                        "top_k": {
                            "type": "integer",
                            "description": "参考的文章数量，默认5",
                            "default": 5
                        }
                    },
                    "required": ["question"]
                }),
            },
            Tool {
                name: "get_recent_articles".to_string(),
                description: "获取最新法律资讯文章列表。".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "limit": {
                            "type": "integer",
                            "description": "返回文章数量，默认10",
                            "default": 10
                        }
                    }
                }),
            },
        ];

        let result = ListToolsResult { tools };
        JsonRpcResponse::success(id, serde_json::to_value(result).unwrap())
    }

    async fn handle_call_tool(&self, id: Option<Value>, params: Option<Value>) -> JsonRpcResponse {
        let params: CallToolParams = match params {
            Some(p) => match serde_json::from_value(p) {
                Ok(p) => p,
                Err(e) => {
                    return JsonRpcResponse::error(id, -32602, &format!("Invalid params: {}", e))
                }
            },
            None => return JsonRpcResponse::error(id, -32602, "Missing params"),
        };

        let result = match params.name.as_str() {
            "search_articles" => self.tool_search_articles(params.arguments).await,
            "semantic_search" => self.tool_semantic_search(params.arguments).await,
            "ask_question" => self.tool_ask_question(params.arguments).await,
            "get_recent_articles" => self.tool_get_recent_articles(params.arguments).await,
            _ => Err(format!("Unknown tool: {}", params.name)),
        };

        match result {
            Ok(text) => {
                let tool_result = CallToolResult {
                    content: vec![ToolContent::Text { text }],
                    is_error: None,
                };
                JsonRpcResponse::success(id, serde_json::to_value(tool_result).unwrap())
            }
            Err(e) => {
                let tool_result = CallToolResult {
                    content: vec![ToolContent::Text { text: e }],
                    is_error: Some(true),
                };
                JsonRpcResponse::success(id, serde_json::to_value(tool_result).unwrap())
            }
        }
    }

    async fn tool_search_articles(&self, args: Option<Value>) -> Result<String, String> {
        let args = args.ok_or("Missing arguments")?;
        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or("Missing query parameter")?;
        let limit = args.get("limit").and_then(|v| v.as_i64()).unwrap_or(10);

        let tenant_id = self.default_tenant_id().await?;
        let articles = self
            .article_service
            .search(tenant_id, query, limit)
            .await
            .map_err(|e| e.to_string())?;

        if articles.is_empty() {
            return Ok("未找到匹配的文章。".to_string());
        }

        let mut result = format!("找到 {} 篇相关文章：\n\n", articles.len());
        for (i, article) in articles.iter().enumerate() {
            result.push_str(&format!(
                "{}. **{}**\n   ID: {}\n   摘要: {}\n   发布时间: {}\n\n",
                i + 1,
                article.title,
                article.id,
                article.summary.as_deref().unwrap_or("无摘要"),
                article
                    .published_at
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ));
        }

        Ok(result)
    }

    async fn tool_semantic_search(&self, args: Option<Value>) -> Result<String, String> {
        let args = args.ok_or("Missing arguments")?;
        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or("Missing query parameter")?;
        let limit = args.get("limit").and_then(|v| v.as_i64()).unwrap_or(5);

        let tenant_id = self.default_tenant_id().await?;
        let results = self
            .rag_service
            .search(tenant_id, query, limit)
            .await
            .map_err(|e| e.to_string())?;

        if results.is_empty() {
            return Ok("未找到相关内容。".to_string());
        }

        let mut output = format!("找到 {} 个相关片段：\n\n", results.len());
        for (i, result) in results.iter().enumerate() {
            output.push_str(&format!(
                "{}. [相似度: {:.2}%]\n   文章ID: {}\n   内容: {}\n\n",
                i + 1,
                result.similarity * 100.0,
                result.article_id,
                result.content.chars().take(300).collect::<String>()
            ));
        }

        Ok(output)
    }

    async fn tool_ask_question(&self, args: Option<Value>) -> Result<String, String> {
        let args = args.ok_or("Missing arguments")?;
        let question = args
            .get("question")
            .and_then(|v| v.as_str())
            .ok_or("Missing question parameter")?;
        let top_k = args.get("top_k").and_then(|v| v.as_i64()).unwrap_or(5);

        let tenant_id = self.default_tenant_id().await?;
        let answer = self
            .rag_service
            .answer(tenant_id, question, top_k)
            .await
            .map_err(|e| e.to_string())?;

        let mut output = format!(
            "**回答** (置信度: {:.0}%)\n\n{}\n\n",
            answer.confidence * 100.0,
            answer.answer
        );

        if !answer.sources.is_empty() {
            output.push_str("**参考来源:**\n");
            for (i, source) in answer.sources.iter().enumerate() {
                output.push_str(&format!(
                    "{}. {} (相关度: {:.0}%)\n",
                    i + 1,
                    source.title,
                    source.relevance * 100.0
                ));
            }
        }

        Ok(output)
    }

    async fn tool_get_recent_articles(&self, args: Option<Value>) -> Result<String, String> {
        let limit = args
            .as_ref()
            .and_then(|a| a.get("limit"))
            .and_then(|v| v.as_i64())
            .unwrap_or(10);

        let tenant_id = self.default_tenant_id().await?;
        let articles = self
            .article_service
            .list(tenant_id, limit, 0)
            .await
            .map_err(|e| e.to_string())?;

        if articles.is_empty() {
            return Ok("暂无文章。".to_string());
        }

        let mut result = format!("最新 {} 篇文章：\n\n", articles.len());
        for (i, article) in articles.iter().enumerate() {
            result.push_str(&format!(
                "{}. **{}**\n   状态: {} | 分类: {}\n   发布时间: {}\n\n",
                i + 1,
                article.title,
                article.status,
                article
                    .category_id
                    .map(|id| id.to_string())
                    .unwrap_or_else(|| "未分类".to_string()),
                article
                    .published_at
                    .map(|d| d.format("%Y-%m-%d %H:%M").to_string())
                    .unwrap_or_default()
            ));
        }

        Ok(result)
    }

    fn handle_list_resources(&self, id: Option<Value>) -> JsonRpcResponse {
        let resources = vec![
            Resource {
                uri: "laweye://categories".to_string(),
                name: "法律资讯分类".to_string(),
                description: Some("所有可用的资讯分类列表".to_string()),
                mime_type: Some("application/json".to_string()),
            },
            Resource {
                uri: "laweye://stats".to_string(),
                name: "系统统计".to_string(),
                description: Some("法律资讯系统的统计信息".to_string()),
                mime_type: Some("application/json".to_string()),
            },
        ];

        let result = ListResourcesResult { resources };
        JsonRpcResponse::success(id, serde_json::to_value(result).unwrap())
    }

    async fn handle_read_resource(
        &self,
        id: Option<Value>,
        params: Option<Value>,
    ) -> JsonRpcResponse {
        let params: ReadResourceParams = match params {
            Some(p) => match serde_json::from_value(p) {
                Ok(p) => p,
                Err(e) => {
                    return JsonRpcResponse::error(id, -32602, &format!("Invalid params: {}", e))
                }
            },
            None => return JsonRpcResponse::error(id, -32602, "Missing params"),
        };

        let content = match params.uri.as_str() {
            "laweye://categories" => {
                let categories = match self.category_service.list().await {
                    Ok(v) => v,
                    Err(e) => {
                        error!("Failed to list categories: {}", e);
                        return JsonRpcResponse::error(id, -32603, "Failed to read categories");
                    }
                };

                let categories = categories
                    .into_iter()
                    .map(|c| {
                        json!({
                            "id": c.id,
                            "slug": c.slug,
                            "name": c.name,
                            "description": c.description,
                            "parent_id": c.parent_id,
                            "sort_order": c.sort_order,
                            "icon": c.icon,
                            "color": c.color,
                            "created_at": c.created_at,
                        })
                    })
                    .collect::<Vec<_>>();

                json!({
                    "categories": categories
                })
                .to_string()
            }
            "laweye://stats" => {
                let tenant_id = match self.default_tenant_id().await {
                    Ok(v) => v,
                    Err(e) => {
                        error!("Failed to load default tenant: {}", e);
                        return JsonRpcResponse::error(id, -32603, "Failed to compute stats");
                    }
                };

                let article_stats = match self.article_service.get_stats(tenant_id).await {
                    Ok(v) => v,
                    Err(e) => {
                        error!("Failed to load article stats: {}", e);
                        return JsonRpcResponse::error(id, -32603, "Failed to compute stats");
                    }
                };

                let categories_total: (i64,) =
                    match sqlx::query_as("SELECT COUNT(*) FROM categories")
                        .fetch_one(&self.pool)
                        .await
                    {
                        Ok(v) => v,
                        Err(e) => {
                            error!("Failed to count categories: {}", e);
                            return JsonRpcResponse::error(id, -32603, "Failed to compute stats");
                        }
                    };

                let sources_total: (i64,) =
                    match law_eye_core::with_tenant_tx(&self.pool, tenant_id, |tx| {
                        Box::pin(async move {
                            sqlx::query_as("SELECT COUNT(*) FROM sources")
                                .fetch_one(tx.as_mut())
                                .await
                                .map_err(|e| law_eye_common::Error::Database(e.to_string()))
                        })
                    })
                    .await
                    {
                        Ok(v) => v,
                        Err(e) => {
                            error!("Failed to count sources: {}", e);
                            return JsonRpcResponse::error(id, -32603, "Failed to compute stats");
                        }
                    };

                let users_total: (i64,) =
                    match sqlx::query_as("SELECT COUNT(*) FROM users WHERE tenant_id = $1")
                        .bind(tenant_id)
                        .fetch_one(&self.pool)
                        .await
                    {
                        Ok(v) => v,
                        Err(e) => {
                            error!("Failed to count users: {}", e);
                            return JsonRpcResponse::error(id, -32603, "Failed to compute stats");
                        }
                    };

                json!({
                    "status": "operational",
                    "version": env!("CARGO_PKG_VERSION"),
                    "articles": article_stats,
                    "counts": {
                        "categories": categories_total.0,
                        "sources": sources_total.0,
                        "users": users_total.0
                    }
                })
                .to_string()
            }
            _ => return JsonRpcResponse::error(id, -32602, "Unknown resource URI"),
        };

        let result = ReadResourceResult {
            contents: vec![ResourceContent::Text {
                uri: params.uri,
                text: content,
            }],
        };

        JsonRpcResponse::success(id, serde_json::to_value(result).unwrap())
    }
}
