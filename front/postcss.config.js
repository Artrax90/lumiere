import postcssPresetEnv from 'postcss-preset-env';

const isTizen = process.env.VITE_BUILD_MODE === 'tizen';

export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
    ...(isTizen ? {
      'postcss-preset-env': {
        browsers: 'chrome 56',
        features: {
          'nesting-rules': false,
          'custom-properties': true,
          'gap-properties': true,
          'logical-properties-and-values': false,
        },
      },
    } : {}),
  },
};
