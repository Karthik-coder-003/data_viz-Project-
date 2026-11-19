const path = require('path');

module.exports = {
  mode: 'development', // change to 'production' for builds
  entry: './src/index.ts',
  devtool: 'inline-source-map',
  devServer: {
    static: './dist',
    hot: true,
    port: 8080,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    // Do NOT clean dist/: it also holds index.html, style.css and the data files.
    clean: false,
  },
};