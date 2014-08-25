module.exports = function(grunt){

  grunt.initConfig({
    uglify: {
      test: {
        files: {
          'test/browser/compiledSuite.js': ['test/browser/assembled.js']
        }
      },
      build: {
        files: {
          'build/ndn-io.min.js' : ["build/ndn-io.js"]
        }
      }
    },
    browserify: {
      options:{
        alias: ["./src/browser/readFile.js:./src/node/readFile.js", "./src/browser/assembleFile.js:./src/node/assembleFile.js"]

      },
      test: {
        src: "test/browser/suite.js",
        dest: "test/browser/assembled.js"
      },
      build: {
        src: "index.js",
        dest: "build/ndn-io.js",
        options: {
          bundleOptions: {
            standalone: 'IO'
          }
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
        src: ["test/node/suite.js"]
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
        tasks: ["jshint", "browserify:test", "uglify:test", "mochaTest" ]
      },
      livereload: {
        options: { livereload: true },
        files: ['test/browser/compiledSuite.js'],
      }

    }
  })

  grunt.loadNpmTasks('grunt-jsdoc');
  grunt.loadNpmTasks("grunt-mocha-test");
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks("grunt-contrib-watch");
  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-contrib-uglify');

  grunt.registerTask('suite', ['jshint', 'browserify:test', "mochaTest"])
  grunt.registerTask('build', [ "browserify:build", "uglify:build"])

}
