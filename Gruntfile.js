module.exports = function(grunt){
    var browsers = [{
        browserName: "chrome",
        version: "33",
        platform: "XP"
    }, {
        browserName: "chrome",
        version: "33",
        platform: "Linux"
    }];

  grunt.initConfig({
    browserify: {
      test: {
        files: {
          "mocha/browser/testLib.js": ["mocha/browser/browser-spec.js"]
        },
 	options: {
	  'transform': ["workerify"] 
	}
      }
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

  grunt.loadNpmTasks('grunt-browserify') 
  grunt.loadNpmTasks('grunt-saucelabs')
  grunt.loadNpmTasks('grunt-contrib-connect')
  grunt.registerTask('tester', ['connect', 'saucelabs-mocha'])
  grunt.registerTask('build', ['browserify:test', 'connect', 'saucelabs-mocha'])

}
