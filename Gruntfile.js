module.exports = function(grunt){

  grunt.initConfig({
    browserify: {
      test: {
        files: {
          "test/browser/test.js": ["test/browser/browser-spec.js"]
        },
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
    jshint: {
      options: {
        curly: true,
        eqeqeq: true,
        laxcomma: true,
        laxbreak: true
      },
      All: ["src/*.js", "src/**/*.js"]
    },
    connect: {
      server: {
      }
    },
    'saucelabs-mocha': {
      all: {
        options: {
          urls: ["http://127.0.0.1:8000/mocha/browser/test.html"],
          username: "rynomadCSU",
          key: "c954c8b8-41ce-45b1-bba2-3b8806d5e2cf",
          tunnelTimeout: 5,
          concurrency: 3,
          browsers: browsers,
          testname: "ndn-io",
          tags: ["master"]
        }
      }
    },
    mochaSelenium: {
      options: {
        // Mocha options
        reporter: 'spec',
        timeout: 30e3,
        // Toggles wd's promises API, default:false
        usePromises: false,
        useChrome: true
      },
      firefox: {
        src: ['test.js'],
        options: {
          host: "ondemand.saucelabs.com",
          port: 80,
          username: "rynomadCSU",
          accesskey: "c954c8b8-41ce-45b1-bba2-3b8806d5e2cf"
        }
      }
    }
  })

  grunt.loadNpmTasks('grunt-jsdoc');
  grunt.loadNpmTasks('grunt-contrib-jshint');

  grunt.loadNpmTasks('grunt-browserify')
  grunt.loadNpmTasks('grunt-saucelabs')
  grunt.loadNpmTasks('grunt-contrib-connect')
  grunt.registerTask('tester', ['connect', 'saucelabs-mocha'])
  grunt.registerTask('build', ['browserify:test', 'connect', 'saucelabs-mocha'])

}
