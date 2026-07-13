export function getDevServerEnvironment(environment) {
  return {
    ...environment,
    DATABASE_URL: environment.DATABASE_URL || 'file:./data/scriptmanager.db',
  }
}
