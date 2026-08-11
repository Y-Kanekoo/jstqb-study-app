module.exports = ({ config }) => {
  const configuredBaseUrl = process.env.EXPO_PUBLIC_BASE_URL?.trim().replace(/\/$/u, '');
  return {
    ...config,
    experiments: {
      ...config.experiments,
      ...(configuredBaseUrl ? { baseUrl: configuredBaseUrl } : {}),
    },
  };
};
