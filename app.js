
var sys = require('sys');
var http = require('http');
var     json = JSON.stringify,
        log = sys.puts;

//The Express framework
var express = require('express');

//This handles our websocket connections
var io = require('socket.io');

//The twitter client
var twitter = require('./lib/node-twitter');

//Connect middleware
var connect = require('connect');
var MemoryStore = require('connect/middleware/session/memory');

//Handles our twitter oauth on the browser
var auth= require('./lib/connect-auth/index');
var OAuth= require('./lib/oauth').OAuth;

//Loads in our twitter auth keys
try {
  var example_keys= require('./lib/keys_file');
  for(var key in example_keys) {
    global[key]= example_keys[key];
  }
}
catch(e) {
  console.log('Unable to locate the keys_file.js file.  Please copy and ammend the example_keys_file.js as appropriate');
  return;
}

//Create our webserver
var app = module.exports = express.createServer(
    //Register cookie handlers
    connect.cookieDecoder(),
    //Register session handler
    connect.session({ store: new MemoryStore({ reapInterval: -1 }) }),
    //Setup auth
    auth( [
      auth.Twitter({consumerKey: twitterConsumerKey, consumerSecret: twitterConsumerSecret})
    ])        
);

// Configuration
app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyDecoder());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.staticProvider(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.errorHandler()); 
});

// Routes
app.get ('/auth/twitter', function(req, res, params) {
    req.authenticate(['twitter'], function(error, authenticated) {
      if( authenticated ) {
          //Render authenticated page
          //Set our tokens to be used in the html
          //These will be sent back to the browser via a websocket
          res.render('auth', {
            locals: {
                title: 'Twitter media',
                token: req.getAuthDetails()["twitter_oauth_token"],
                token_secret: req.getAuthDetails()["twitter_oauth_token_secret"]
            }
          });
      }
      else {
        res.writeHead(200, {'Content-Type': 'text/html'})
        res.end("<html><h1>Twitter authentication failed :( </h1></html>")
      }
    });
  })

//Index page
app.get('/', function(req, res){
     res.render('index', {
            locals: {
                title: 'Twitter media'
            }
        });
});

//Attacking our socket to the webapp for incoming requests
var socket = io.listen(app);

socket.on('connection', function(client){
  //We have a message
  client.on('message', function(data){
      //Dump the message
      log(sys.inspect(data));

      //Create a new twitter oAuth object
      var twit = new twitter({
          consumer_key: twitterConsumerKey,
          consumer_secret: twitterConsumerSecret,
          access_token_key: data.token,
          access_token_secret: data.token_secret
      });
      //Setup the stream
      twit.stream('user', function(stream) {
        stream.on('data', function (data) {
            if(data.entities)
            {
                //Have we got urls?
                if(data.entities.urls.length>0)
                {
                    //Send them to the client as a json string
                    for(var i=0; i<data.entities.urls.length; i++)
                    {
                      get_long_url(data.entities.urls[i], client);
                    }
                    //client.send(json(data.entities.urls));
                    sys.puts(sys.inspect(data.entities.urls));
                }
            }
            else
            {
                sys.puts("Starting twitter connection");
            }
        });
        //Store for use later
        client.stream = stream;
      });
  });
  //Disconnect sent
  client.on('disconnect', function(){
    client.stream.emit('end');
    client.stream.emit('close');
  });
});

var tweetmeme_client = http.createClient(80, "api.tweetmeme.com");
var EventEmitter = require('events').EventEmitter;
var tweetmeme_emmiter = new EventEmitter;

tweetmeme_emmiter.on('url', function(urldata, client){
    client.send(json([urldata]));
    sys.puts(sys.inspect(urldata));
});

function get_long_url(urldata, client)
{
   var url = urldata.url;
    var request = tweetmeme_client.request("GET", "/url_info.json?url="+url, {"host": "api.tweetmeme.com"});

    request.addListener("response", function(response) {
        var body = "";
        response.addListener("data", function(data) {
            body += data;
        });

        response.addListener("end", function() {
            var jsondata = JSON.parse(body);

            if(jsondata.status=='success')
            {
                urldata.url = jsondata.story.url;
            }
            tweetmeme_emmiter.emit("url", urldata, client);
        });
    });

    request.end();
}

// Only listen on $ node app.js
if (!module.parent) {
  app.listen(3010);
  console.log("Express server listening on port %d", app.address().port)
}