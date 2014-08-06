module.exports = function(grunt){

  grunt.initConfig({
    browserify: {
      test: {
        src: "test/browser/spec.js",
        dest: "test/browser/browser-spec.js",
        options: {
          'transform': ["workerify"]
        }
      }
    },
    jsdoc : {
      dist : {
        src: ['src/**/*.js', "src/*.js"],
        options: {
          destination: 'doc'
        }
      }
    },
    mochaTest: {
      suite: {
        options: {
          reporter: 'spec'
          ,clearRequireCache: true
        },
        src: ["test/node/spec.js"]
      },
    },
    jshint: {
      options: {
        curly: true,
        eqeqeq: true,
        laxcomma: true,
        laxbreak: true
      },
      All: ["src/*.js", "src/**/*.js"]
    },
    watch: {
      all: {
        files: ["src/*.js", "src/**/*.js"],
        tasks: ["jshint", "browserify", "mochaTest" ]
      },
      livereload: {
        options: { livereload: true },
        files: ['test/browser/**/*.js'],
      }

    }
  })

  grunt.loadNpmTasks('grunt-jsdoc');
  grunt.loadNpmTasks("grunt-mocha-test");
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks("grunt-contrib-watch");
  grunt.loadNpmTasks("grunt-saucelabs");
  grunt.loadNpmTasks('grunt-browserify');

  grunt.registerTask('suite', ['jshint', 'browserify', "mochaTest"])
  grunt.registerTask('build', ['browserify:test', 'connect', 'saucelabs-mocha'])

}
