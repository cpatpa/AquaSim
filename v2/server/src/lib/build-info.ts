export const BUILD_INFO = {
  commitHash: process.env.GIT_COMMIT || 'dev',
  buildTime: process.env.BUILD_TIME || new Date().toISOString(),
  version: '2.0.0',
};
