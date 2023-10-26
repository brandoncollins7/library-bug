const {composePlugins, withNx} = require('@nx/webpack')
const nodeExternals = require('webpack-node-externals')
const webpack = require('webpack')
const swcDefaultConfig = require('@nestjs/cli/lib/compiler/defaults/swc-defaults').swcDefaultsFactory().swcOptions
const {RunScriptWebpackPlugin} = require('run-script-webpack-plugin')
const path = require('path')
// Set true if you don't want type checking
const skipTypeChecking = false

// Nx plugins for webpack.
module.exports = composePlugins(withNx({skipTypeChecking}), (config) => {
  // Update the webpack config as needed here.
  // e.g. `config.plugins.push(new MyPlugin())`
  // config.module.rules = [
  //   {
  //     test: /\.ts|.js$/,
  //     exclude: /node_modules/,
  //     use: {
  //       loader: 'swc-loader',
  //       options: swcDefaultConfig
  //     }
  //   }
  // ]
  return {
    ...config,
    entry: ['webpack/hot/poll?100', './src/main.ts'],
    target: 'node',
    externals: [
      nodeExternals({
        allowlist: ['webpack/hot/poll?100']
      })
    ],
    module: {
      rules: [
        {
          test: /\.tsx$/,
          use: 'ts-loader',
          exclude: /node_modules/
        },
        {
          test: /\.ts|.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'swc-loader',
            options: swcDefaultConfig
          }
        }
      ]
    },
    mode: 'development',
    resolve: {
      extensions: ['.tsx', '.ts', '.js']
    },
    plugins: [new webpack.HotModuleReplacementPlugin(), new RunScriptWebpackPlugin({name: 'server.js', autoRestart: false})],
    output: {
      path: path.join(__dirname, 'dist'),
      filename: 'server.js'
    }
  }
})
