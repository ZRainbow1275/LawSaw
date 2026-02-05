use aws_config::BehaviorVersion;
use aws_credential_types::Credentials;
use aws_sdk_s3::error::SdkError;
use aws_sdk_s3::operation::create_bucket::CreateBucketError;
use aws_sdk_s3::operation::head_bucket::HeadBucketError;
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::types::{BucketLocationConstraint, CreateBucketConfiguration};
use aws_types::region::Region;
use law_eye_common::{Error, Result};
use law_eye_db::{CreateAuditLog, Object, User};
use serde_json::json;
use sqlx::PgPool;
use std::time::Duration;
use tokio::time::sleep;
use uuid::Uuid;

use crate::tenant::with_tenant_tx;
use crate::AuditService;

pub const OBJECT_KIND_USER_AVATAR: &str = "user.avatar";

const MAX_AVATAR_BYTES: usize = 1_048_576; // 1 MiB
const ENSURE_BUCKET_MAX_ATTEMPTS: usize = 10;
const ENSURE_BUCKET_INITIAL_BACKOFF_MS: u64 = 250;
const DEFAULT_LIST_OBJECTS_MAX_KEYS: i32 = 1000;

#[derive(Debug, Clone)]
pub struct ListedObject {
    pub object_key: String,
    pub last_modified_epoch_secs: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct ListObjectsPage {
    pub objects: Vec<ListedObject>,
    pub next_continuation_token: Option<String>,
}

#[derive(Debug, Clone)]
pub struct UploadUserAvatarInput {
    pub tenant_id: Uuid,
    pub actor_user_id: Uuid,
    pub target_user_id: Uuid,
    pub previous_avatar_url: Option<String>,
    pub content_type: String,
    pub bytes: Vec<u8>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

#[derive(Clone)]
pub struct ObjectService {
    pool: PgPool,
    bucket: String,
    region: String,
    client: aws_sdk_s3::Client,
}

impl ObjectService {
    pub async fn new(
        pool: PgPool,
        cfg: &law_eye_common::config::ObjectStorageConfig,
    ) -> Result<Self> {
        if cfg.bucket.trim().is_empty() {
            return Err(Error::Config(
                "LAW_EYE__OBJECT_STORAGE__BUCKET must not be empty".into(),
            ));
        }
        if cfg.endpoint.trim().is_empty() {
            return Err(Error::Config(
                "LAW_EYE__OBJECT_STORAGE__ENDPOINT must not be empty".into(),
            ));
        }
        if cfg.access_key_id.trim().is_empty() {
            return Err(Error::Config(
                "LAW_EYE__OBJECT_STORAGE__ACCESS_KEY_ID must not be empty".into(),
            ));
        }
        if cfg.secret_access_key.trim().is_empty() {
            return Err(Error::Config(
                "LAW_EYE__OBJECT_STORAGE__SECRET_ACCESS_KEY must not be empty".into(),
            ));
        }

        let region = Region::new(cfg.region.clone());
        let creds = Credentials::new(
            cfg.access_key_id.trim().to_string(),
            cfg.secret_access_key.trim().to_string(),
            None,
            None,
            "law-eye",
        );

        let shared = aws_config::defaults(BehaviorVersion::latest())
            .region(region)
            .credentials_provider(creds)
            .load()
            .await;

        let s3_config = aws_sdk_s3::config::Builder::from(&shared)
            .endpoint_url(cfg.endpoint.trim().to_string())
            .force_path_style(cfg.force_path_style)
            .build();

        let client = aws_sdk_s3::Client::from_conf(s3_config);

        let service = Self {
            pool,
            bucket: cfg.bucket.trim().to_string(),
            region: cfg.region.trim().to_string(),
            client,
        };

        service.ensure_bucket().await?;

        Ok(service)
    }

    pub fn bucket(&self) -> &str {
        &self.bucket
    }

    fn is_bucket_not_found(err: &SdkError<HeadBucketError>) -> bool {
        match err {
            SdkError::ServiceError(service_error) => {
                let code = service_error.err().meta().code().unwrap_or_default();
                matches!(code, "NotFound" | "NoSuchBucket")
            }
            _ => false,
        }
    }

    fn is_bucket_already_exists(err: &SdkError<CreateBucketError>) -> bool {
        match err {
            SdkError::ServiceError(service_error) => {
                let code = service_error.err().meta().code().unwrap_or_default();
                matches!(code, "BucketAlreadyOwnedByYou" | "BucketAlreadyExists")
            }
            _ => false,
        }
    }

    async fn ensure_bucket(&self) -> Result<()> {
        for attempt in 1..=ENSURE_BUCKET_MAX_ATTEMPTS {
            match self.client.head_bucket().bucket(&self.bucket).send().await {
                Ok(_) => return Ok(()),
                Err(err) if Self::is_bucket_not_found(&err) => break,
                Err(err) => {
                    if attempt == ENSURE_BUCKET_MAX_ATTEMPTS {
                        return Err(Error::Http(format!("Head bucket failed: {err:?}")));
                    }

                    let delay =
                        Duration::from_millis(ENSURE_BUCKET_INITIAL_BACKOFF_MS * attempt as u64);
                    sleep(delay).await;
                }
            }
        }

        for attempt in 1..=ENSURE_BUCKET_MAX_ATTEMPTS {
            let mut req = self.client.create_bucket().bucket(&self.bucket);

            // AWS S3 requires a location constraint for regions other than `us-east-1`.
            // MinIO ignores this field.
            if !self.region.trim().is_empty() && self.region != "us-east-1" {
                req = req.create_bucket_configuration(
                    CreateBucketConfiguration::builder()
                        .location_constraint(BucketLocationConstraint::from(self.region.as_str()))
                        .build(),
                );
            }

            match req.send().await {
                Ok(_) => return Ok(()),
                Err(err) if Self::is_bucket_already_exists(&err) => return Ok(()),
                Err(err) => {
                    if attempt == ENSURE_BUCKET_MAX_ATTEMPTS {
                        return Err(Error::Http(format!("Create bucket failed: {err:?}")));
                    }

                    let delay =
                        Duration::from_millis(ENSURE_BUCKET_INITIAL_BACKOFF_MS * attempt as u64);
                    sleep(delay).await;
                }
            }
        }

        Ok(())
    }

    fn avatar_extension(content_type: &str) -> Result<&'static str> {
        match content_type {
            "image/png" => Ok("png"),
            "image/jpeg" => Ok("jpg"),
            "image/webp" => Ok("webp"),
            _ => Err(Error::Validation(format!(
                "Unsupported avatar content-type: {content_type}"
            ))),
        }
    }

    pub async fn upload_user_avatar(
        &self,
        input: UploadUserAvatarInput,
        audit_service: &AuditService,
    ) -> Result<(User, Object)> {
        let UploadUserAvatarInput {
            tenant_id,
            actor_user_id,
            target_user_id,
            previous_avatar_url,
            content_type,
            bytes,
            ip_address,
            user_agent,
        } = input;

        if bytes.is_empty() {
            return Err(Error::Validation("Avatar file is empty".into()));
        }
        if bytes.len() > MAX_AVATAR_BYTES {
            return Err(Error::Validation(format!(
                "Avatar file too large (max {} bytes)",
                MAX_AVATAR_BYTES
            )));
        }

        let byte_size = bytes.len() as i64;
        let ext = Self::avatar_extension(&content_type)?;
        let object_id = Uuid::new_v4();
        let object_key =
            format!("tenants/{tenant_id}/users/{target_user_id}/avatars/{object_id}.{ext}");

        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(&object_key)
            .content_type(&content_type)
            .body(ByteStream::from(bytes))
            .send()
            .await
            .map_err(|e| Error::Http(format!("Put object failed: {e:?}")))?;

        let bucket = self.bucket.clone();
        let object_key_for_delete = object_key.clone();

        let tx_result = with_tenant_tx(&self.pool, tenant_id, |tx| {
            let object_key = object_key.clone();
            let bucket = bucket.clone();
            let content_type = content_type.clone();
            let previous_avatar_url = previous_avatar_url.clone();
            let ip_address = ip_address.clone();
            let user_agent = user_agent.clone();
            Box::pin(async move {
                let object = sqlx::query_as::<_, Object>(
                    r#"
                    INSERT INTO objects (id, owner_user_id, kind, bucket, object_key, content_type, byte_size, sha256)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING *
                    "#,
                )
                .bind(object_id)
                .bind(Some(target_user_id))
                .bind(OBJECT_KIND_USER_AVATAR)
                .bind(&bucket)
                .bind(&object_key)
                .bind(&content_type)
                .bind(byte_size)
                .bind(None::<Vec<u8>>)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let avatar_url = format!("/api/v1/objects/{}", object.id);
                let user = sqlx::query_as::<_, User>(
                    r#"
                    UPDATE users
                    SET avatar_url = $3, updated_at = NOW()
                    WHERE id = $1 AND tenant_id = $2
                    RETURNING *
                    "#,
                )
                .bind(target_user_id)
                .bind(tenant_id)
                .bind(&avatar_url)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let audit_input = CreateAuditLog {
                    user_id: Some(actor_user_id),
                    action: "users.avatar.upload".to_string(),
                    resource: "users".to_string(),
                    resource_id: Some(target_user_id),
                    old_value: Some(json!({
                        "avatar_url": previous_avatar_url,
                    })),
                    new_value: Some(json!({
                        "object_id": object.id,
                        "avatar_url": user.avatar_url,
                        "content_type": content_type,
                        "byte_size": object.byte_size,
                    })),
                    ip_address,
                    user_agent,
                };

                audit_service
                    .log_tx(tenant_id, tx, audit_input)
                    .await?;

                Ok((user, object))
            })
        })
        .await;

        match tx_result {
            Ok(result) => Ok(result),
            Err(err) => {
                let _ = self
                    .client
                    .delete_object()
                    .bucket(&self.bucket)
                    .key(&object_key_for_delete)
                    .send()
                    .await;
                Err(err)
            }
        }
    }

    pub async fn get_object_record(&self, tenant_id: Uuid, id: Uuid) -> Result<Object> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, Object>(
                    "SELECT * FROM objects WHERE id = $1 AND deleted_at IS NULL AND purged_at IS NULL",
                )
                .bind(id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("Object {} not found", id)))
            })
        })
        .await
    }

    pub async fn get_object_stream(&self, object: &Object) -> Result<ByteStream> {
        let resp = self
            .client
            .get_object()
            .bucket(&object.bucket)
            .key(&object.object_key)
            .send()
            .await
            .map_err(|e| Error::Http(format!("Get object failed: {e:?}")))?;

        Ok(resp.body)
    }

    pub async fn get_object_stream_range(
        &self,
        object: &Object,
        start: u64,
        end: u64,
    ) -> Result<ByteStream> {
        let range = format!("bytes={start}-{end}");
        let resp = self
            .client
            .get_object()
            .bucket(&object.bucket)
            .key(&object.object_key)
            .range(range)
            .send()
            .await
            .map_err(|e| Error::Http(format!("Get object (range) failed: {e:?}")))?;

        Ok(resp.body)
    }

    pub async fn delete_object_key(&self, object_key: &str) -> Result<()> {
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(object_key)
            .send()
            .await
            .map_err(|e| Error::Http(format!("Delete object failed: {e:?}")))?;
        Ok(())
    }

    pub async fn list_objects_page(
        &self,
        prefix: &str,
        continuation_token: Option<String>,
        max_keys: Option<i32>,
    ) -> Result<ListObjectsPage> {
        let max_keys = max_keys.unwrap_or(DEFAULT_LIST_OBJECTS_MAX_KEYS);

        let mut req = self
            .client
            .list_objects_v2()
            .bucket(&self.bucket)
            .prefix(prefix)
            .max_keys(max_keys);
        if let Some(token) = continuation_token {
            req = req.continuation_token(token);
        }

        let resp = req
            .send()
            .await
            .map_err(|e| Error::Http(format!("List objects failed: {e:?}")))?;

        let objects = resp
            .contents()
            .iter()
            .filter_map(|obj| {
                obj.key().map(|key| ListedObject {
                    object_key: key.to_string(),
                    last_modified_epoch_secs: obj.last_modified().map(|dt| dt.secs()),
                })
            })
            .collect::<Vec<_>>();

        Ok(ListObjectsPage {
            objects,
            next_continuation_token: resp.next_continuation_token().map(|s| s.to_string()),
        })
    }
}
