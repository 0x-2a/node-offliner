var request = require('request');
var cheerio = require('cheerio');
var _ = require('underscore');
var fs = require('fs');
var URI = require('URIjs');
var sanitize = require("sanitize-filename");
var mkdirp = require('mkdirp');
var moment = require('moment');
var htmlMinify = require('html-minifier').minify;

var host = "localhost:3000"
var path = "/ipad/ipad.html";
//var host = "tumblr.com";
//var path = "/";
//var host = "kickstarter.com";
//var path = "/projects/khaoskreator/shades-of-a-omnibus-limited-edition-hardback.html?ref=popular";

var opts = {
  url: "http://" + host + path,
  method: "GET",
  headers: {
    "Host": host,
    "Connection": "keep-alive",
    "Pragma": "no-cache",
    "Cache-Control": "no-cache",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/43.0.2357.130 Safari/537.36",
    "DNT": "1",
    "Accept-Language": "en-US,en;q=0.8"
  }
};

console.log("Requesting Page: ", opts.url);

request(opts, function (err, res, body) {
  if (err) {
    console.error("Couldn't load page", err);
    return;
  }

  console.log("Got response, beginning to process.");

  var fileUrlMap = {};

  body = htmlMinify(body, {
    removeComments: true,
    minifyJS: {
      fromString: true,
      warnings: true,
      mangle: false,
      compress: {
        sequences: false,  // join consecutive statemets with the “comma operator”
        properties: false,  // optimize property access: a["foo"] → a.foo
        dead_code: false,  // discard unreachable code
        drop_debugger: false,  // discard “debugger” statements
        unsafe: false, // some unsafe optimizations (see below)
        conditionals: false,  // optimize if-s and conditional expressions
        comparisons: false,  // optimize comparisons
        evaluate: false,  // evaluate constant expressions
        booleans: false,  // optimize boolean expressions
        loops: false,  // optimize loops
        unused: false,  // drop unused variables/functions
        hoist_funs: false,  // hoist function declarations
        hoist_vars: false, // hoist variable declarations
        if_return: false,  // optimize if-s followed by return/continue
        join_vars: false,  // join var declarations
        cascade: false,  // try to cascade `right` into `left` in sequences
        side_effects: false,  // drop side-effect-free statements
        warnings: true,  // warn about potentially dangerous optimizations/code
        global_defs: {}     // global definitions
      }
    }
  });

  var $ = cheerio.load(body);
  var domItems = $("*");
  _(domItems).each(function (domItem) {
    var $domItem = $(domItem);

    var resourceLink = "";

    if ($domItem.is("link")) {
      resourceLink = $domItem.attr("href");
    } else if ($domItem.is("script")) {
      resourceLink = $domItem.attr("src");
    } else if ($domItem.is("img")) {
      resourceLink = $domItem.attr("src");
    } else if ($domItem.attr("src")) {
      resourceLink = $domItem.attr("src");
    } else if ($domItem.attr("data-mp4")) {
      resourceLink = $domItem.attr("data-mp4");
    } else if ($domItem.attr("data-touch-media")) {
      resourceLink = $domItem.attr("data-touch-media");
    }

    if (resourceLink && resourceLink.indexOf("http") < 0) {
      resourceLink = URI(resourceLink).absoluteTo(res.request.uri.href).toString();
    }

    if (resourceLink) {
      var fileName = sanitize(URI(resourceLink).filename());

      if (fileUrlMap[fileName]) {
        fileName = (fileUrlMap[fileName].count + 1) + "-" + fileName;
        fileUrlMap[fileName]++;
      }

      fileUrlMap[fileName] = {
        url: resourceLink,
        fileName: fileName,
        path: URI(resourceLink).path(),
        count: 1
      };

      if ($domItem.is("link")) {
        $domItem.attr("href", fileName);
      } else if ($domItem.is("script")) {
        $domItem.attr("src", fileName);
      } else if ($domItem.is("img")) {
        $domItem.attr("src", fileName);
      } else if ($domItem.attr("src")) {
        $domItem.attr("src", fileName);
      } else if ($domItem.attr("data-mp4")) {
        $domItem.attr("data-mp4", fileName);
      } else if ($domItem.attr("data-touch-media")) {
        $domItem.attr("data-touch-media", fileName);
      }

      console.log(resourceLink, fileName);
    }
  });

  var writeDirectory = "sites/" + host + "-" + moment().format('YYYY-MM-DD-h-mm-ss') + "/";

  mkdirp(writeDirectory, function (err) {
    if (err) console.error(err);
  });

  var htmlFile = writeDirectory + (URI(res.request.uri.href).filename() || "index.html");
  var html = $.html();
  fs.writeFile(htmlFile, html, function (err) {
    if (err) {
      return console.log(err);
    }
    console.log("Writing to file path:", htmlFile);
  });

  var resourceArr = _(fileUrlMap).toArray();

  var download = function (resource, callback) {
    var filePath = writeDirectory + resource.fileName;

    if (fs.existsSync(filePath)) {
      console.warn("Already have file:", filePath);
      return callback()
    }

    console.log("Writing to file path:", filePath);

    request({
      url: resource.url,
      method: "GET"
      //headers: {
      //  "Host": host,
      //  "Connection": "keep-alive",
      //  "Pragma": "no-cache",
      //  "Cache-Control": "no-cache",
      //  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      //  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/43.0.2357.130 Safari/537.36",
      //  "DNT": "1",
      //  "Accept-Language": "en-US,en;q=0.8"
      //}
    }).pipe(fs.createWriteStream(filePath)).on('close', callback).on('error', function (err) {
      console.error(err);
      callback()
    });
  };

  var getFile = function (index) {
    var resource = resourceArr[index];

    download(resource, function () {
      if (err) {
        console.log(err);
      } else {
        console.log("Received:", resource.url);

        if (resourceArr[index + 1]) {
          getFile(index + 1);
        }
      }
    });
  };

  getFile(0);
});