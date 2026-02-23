pub const DEFAULT_PGVECTOR_STORAGE_DIM: usize = 1536;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VectorNormalization {
    pub source_dim: usize,
    pub target_dim: usize,
}

impl VectorNormalization {
    pub fn changed(self) -> bool {
        self.source_dim != self.target_dim
    }
}

pub fn pgvector_storage_dim() -> usize {
    std::env::var("LAW_EYE__AI__STORAGE_VECTOR_DIM")
        .ok()
        .and_then(|raw| raw.trim().parse::<usize>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_PGVECTOR_STORAGE_DIM)
}

pub fn normalize_vector_for_storage(vector: Vec<f32>) -> (Vec<f32>, VectorNormalization) {
    let source_dim = vector.len();
    let target_dim = pgvector_storage_dim();

    if source_dim == target_dim {
        return (
            vector,
            VectorNormalization {
                source_dim,
                target_dim,
            },
        );
    }

    let mut adjusted = vector;
    if source_dim > target_dim {
        adjusted.truncate(target_dim);
    } else {
        adjusted.resize(target_dim, 0.0);
    }

    (
        adjusted,
        VectorNormalization {
            source_dim,
            target_dim,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_vector_for_storage_pads_short_vector() {
        let (vector, normalization) = normalize_vector_for_storage(vec![1.0, 2.0]);
        assert_eq!(normalization.source_dim, 2);
        assert_eq!(normalization.target_dim, pgvector_storage_dim());
        assert!(normalization.changed());
        assert_eq!(vector.len(), pgvector_storage_dim());
        assert_eq!(vector[0], 1.0);
        assert_eq!(vector[1], 2.0);
    }

    #[test]
    fn normalize_vector_for_storage_truncates_long_vector() {
        let long_vec = vec![0.5_f32; pgvector_storage_dim() + 10];
        let (vector, normalization) = normalize_vector_for_storage(long_vec);
        assert!(normalization.changed());
        assert_eq!(vector.len(), pgvector_storage_dim());
    }
}
