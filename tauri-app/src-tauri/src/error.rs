use std::fmt::{Display, Formatter};

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug)]
#[allow(dead_code)]
pub enum AppError {
    Database(sqlx::Error),
    Io(std::io::Error),
    InvalidInput(String),
    Unsupported(String),
}

impl Display for AppError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::Database(error) => write!(formatter, "database error: {error}"),
            AppError::Io(error) => write!(formatter, "I/O error: {error}"),
            AppError::InvalidInput(message) => write!(formatter, "invalid input: {message}"),
            AppError::Unsupported(message) => write!(formatter, "unsupported feature: {message}"),
        }
    }
}

impl std::error::Error for AppError {}

impl From<sqlx::Error> for AppError {
    fn from(error: sqlx::Error) -> Self {
        AppError::Database(error)
    }
}

impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        AppError::Io(error)
    }
}
