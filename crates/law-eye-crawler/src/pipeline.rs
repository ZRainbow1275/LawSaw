use chrono::{DateTime, Utc};
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawArticle {
    pub title: String,
    pub link: String,
    pub content: Option<String>,
    pub author: Option<String>,
    pub published_at: Option<DateTime<Utc>>,
}

pub struct Pipeline {
    stages: Vec<Box<dyn PipelineStage>>,
}

pub trait PipelineStage: Send + Sync {
    fn process(&self, article: RawArticle) -> Option<RawArticle>;
}

impl Pipeline {
    pub fn new() -> Self {
        Self { stages: Vec::new() }
    }

    pub fn add_stage<S: PipelineStage + 'static>(mut self, stage: S) -> Self {
        self.stages.push(Box::new(stage));
        self
    }

    pub fn process(&self, mut article: RawArticle) -> Option<RawArticle> {
        for stage in &self.stages {
            article = stage.process(article)?;
        }
        Some(article)
    }

    pub fn process_batch(&self, articles: Vec<RawArticle>) -> Vec<RawArticle> {
        articles
            .into_iter()
            .filter_map(|a| self.process(a))
            .collect()
    }
}

impl Default for Pipeline {
    fn default() -> Self {
        Self::new()
    }
}

static HTML_TAG_RE: Lazy<Option<Regex>> = Lazy::new(|| Regex::new(r"<[^>]+>").ok());

pub struct CleaningStage;

impl PipelineStage for CleaningStage {
    fn process(&self, mut article: RawArticle) -> Option<RawArticle> {
        article.title = article.title.trim().to_string();
        if let Some(content) = &article.content {
            let stripped = content
                .replace("<br>", "\n")
                .replace("<br/>", "\n")
                .replace("<p>", "\n")
                .replace("</p>", "");
            article.content = match HTML_TAG_RE.as_ref() {
                Some(re) => Some(re.replace_all(&stripped, "").trim().to_string()),
                None => Some(stripped.trim().to_string()),
            };
        }
        Some(article)
    }
}
