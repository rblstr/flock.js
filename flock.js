var express = require('express');
var http = require('http');
var querystring = require('querystring');

var app = express();

app.set('views', './views');
app.set('view engine', 'jade');

// TODO:
// * Modularise in a JavaScripthonic fashion
// * Check scope of all functions and variables
// * time.sleep for rate limited requests
// * Check for substring in string
// * Sort with sorting function
// * In-place string formatting
// * filter() equiv
// * Correct way to end response early

var SUPPORTED_SORTS = [
    'top',
    'hot'
];

var SUPPORTED_TIMES = [
    'day',
    'week',
    'month',
    'year',
    'all'
];

var SUCCESS_CODES = [
    200
]

function getSubredditList() {
    return ['metal'];
}

function getRedditResponse(subreddits, sort, t, limit, onComplete) {
    var path = '/r/' + subreddits.join('+') + '/' + sort + '.json';
    console.log('INFO: path: %s', path);

    var options = {
        'hostname': 'www.reddit.com',
        'path': path,
        'headers': {
            'User-Agent': 'flock.js/0.0.0 by /u/rblstr'
        },
        'qs': {
            't': t,
            'limit': limit
        }
    };

    http.get(options, function (response) {
        console.log('INFO: Got Response:', response.statusCode);
        var data = '';
        response.on('data', function (chunk) {
            data += chunk;
        });
        response.on('end', function() {
            var reddit_response = {};
            try {
                reddit_response = JSON.parse(data);
            } catch (e) {
                console.log('ERROR: JSON syntax error: %s', e.message);
            }
            if (reddit_response.error) {
                console.log('ERROR: Error in reddit response: %s', reddit_response.error);
            }
            onComplete(reddit_response);
        });
    }).on('error', function(error) {
        console.log('ERROR: %s', error.message)
    });
}

function parseRedditResponse(reddit_response) {
    var children = [];
    for (var i = 0, len = reddit_response.data.children.length; i < len; ++i) {
        children.push(reddit_response.data.children[i].data);
    };
    var links = [];
    for (var i = 0, len = children.length; i < len; ++i) {
        var child = children[i];
        links.push(child);
    };
    return links;
}

function getLinks (subreddits, sort, t, onComplete) {
    getRedditResponse(subreddits, sort, t, 100, function(reddit_response) {
        if (!reddit_response) {
            onComplete(null);
        } else {
            var links = parseRedditResponse(reddit_response);
            onComplete(links);
        }
    });
}

app.get('/hello', function(request, response) {
    response.render('index', {title: 'Hey', message: 'Hello there!'});
});

app.get('/', function(request, response) {
    var subreddit_list = getSubredditList();

    var subreddits_str = request.query.subreddits || nil;
    if (!subreddits_str) {
        response.render('index', {title: 'Hey', message: 'Flock homepage'});
        return;
    }

    var sort = request.query.sort || 'hot';
    if (SUPPORTED_SORTS.indexOf(sort) === -1) {
        console.log('ERROR: No sort: %s', sort);
    }

    var t = request.query.t || 'week';
    if (SUPPORTED_TIMES.indexOf(t) === -1) {
        console.log('ERROR: Unsupported t: %s', t);
    }

    var limit = request.query.limit || 100;
    limit = parseInt(limit);
    if (limit !== limit) { // NaN check for non-int strings
        console.log('ERROR: Limit wasn\'t a number: %s', request.query.limit);
    }
    else if (limit < 0 || limit > 100) {
        console.log('ERROR: Limit out of range (0 <= limit <= 100): %d', limit);
    }

    var selected_subreddits = subreddits_str.split(' ');
    var lower_subreddit_list = [];
    var i = 0;
    for (i = 0, len = subreddit_list.length; i < len; ++i) {
        lower_subreddit_list.push(subreddit_list[i].toLowerCase());
    }
    for (i = 0, len = selected_subreddits.length; i < len; i++) {
        var subreddit = selected_subreddits[i];
        if (lower_subreddit_list.indexOf(subreddit.toLowerCase())=== -1) {
            subreddit_list.push(subreddit);
        }
    }

    getLinks(selected_subreddits, sort, t, function(links) {
        console.log('ASYNC BITCHES');

        if (!links) {
            console.log('ERROR: No links found');
        }

        // console.log("INFO: links", links);

        response.render('index', {
            'title': 'Hey',
            'message': subreddits_str,
            'links': links
        });
    });

    console.log('INFO: subreddit_list:', subreddit_list);
    console.log('INFO: sort: %s', sort);
    console.log('INFO: t: %s', t);
    console.log('INFO: limit: %d', limit);
    console.log('INFO: subreddits', selected_subreddits);
});

var server = app.listen(3000, function() {
    var host = server.address().address;
    var port = server.address().port;

    console.log('Example app listening at http://%s:%s', host, port);
});
