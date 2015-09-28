var express = require('express');
var http = require('http');
var querystring = require('querystring');
var url = require('url');

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

var SUPPORTED_SORTS = {
    'top': null,
    'hot': null
};

var SUPPORTED_TIMES = {
    'day': null,
    'week': null,
    'month': null,
    'year': null,
    'all': null
};

var SUCCESS_CODES = [
    200
]

function getSubredditList() {
    return ['metal'];
}

function getRedditResponse(subreddits, sort, t, limit, done) {
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

    console.log("INFO: Requesting %s", path);
    http.get(options, function (response) {
        console.log('INFO: Got Response:', response.statusCode);
        var data = '';
        response.on('data', function (chunk) {
            data += chunk;
        });
        response.on('end', function() {
            var reddit_response;
            try {
                reddit_response = JSON.parse(data);
                if (reddit_response.error) {
                    reddit_response = null;
                    console.log('ERROR: Error in reddit response: %s', reddit_response.error);
                }
            } catch (e) {
                reddit_response = null;
                console.log('ERROR: JSON syntax error: %s', e.message);
            }
            done(reddit_response);
        });
    }).on('error', function(error) {
        console.log('ERROR: %s', error.message)
        done(null);
    });
}

function sanitiseYouTubeUrl(youTubeUrl) {
    var parsedUrl = url.parse(youTubeUrl, true);
    var videoId = parsedUrl.query.v;
    if (!videoId) {
        return null;
    }
    return 'http://www.youtube.com/watch?v=' + videoId;
}

function sanitiseShortYouTubeUrl(youTubeUrl) {
    var parsedUrl = url.parse(youTubeUrl, true);
    var videoId = parsedUrl.pathname.substring(1);
    if (!videoId) {
        return null;
    }
    return 'http://www.youtube.com/watch?v=' + videoId;
}

function sanitiseUrl(youTubeUrl) {
    var lowerUrl = youTubeUrl.toLowerCase();
    if (lowerUrl.indexOf('youtube') !== -1) {
        return sanitiseYouTubeUrl(youTubeUrl);
    } else if (lowerUrl.indexOf('youtu.be') !== -1) {
        return sanitiseShortYouTubeUrl(youTubeUrl);
    } else {
        return null;
    }
}

function parseRedditResponse(reddit_response) {
    var children = [];
    for (var i = 0, len = reddit_response.data.children.length; i < len; ++i) {
        children.push(reddit_response.data.children[i].data);
    };
    var links = [];
    for (var i = 0, len = children.length; i < len; ++i) {
        var child = children[i];
        var sanitisedUrl = sanitiseUrl(child.url);
        if (!sanitisedUrl) {
            continue;
        }
        child.url = sanitisedUrl;
        child.permalink = 'http://www.reddit.com' + child.permalink;
        links.push(child);
    };
    return links;
}

function getLinks (subreddits, sort, t, done) {
    getRedditResponse(subreddits, sort, t, 100, function(reddit_response) {
        if (!reddit_response) {
            done(null);
        } else {
            var links = parseRedditResponse(reddit_response);
            done(links);
        }
    });
}

function generateYouTubeUrl(links) {
    var youTubeIds = [];
    for (var i = 0, len = links.length; i < len; ++i) {
        var link = links[i];
        var linkUrl = link.url;
        var vId = url.parse(linkUrl, true).query.v;
        if (!vId) {
            continue;
        }
        youTubeIds.push(vId);
    };

    var firstId = youTubeIds.shift();
    var playlist = youTubeIds.join(',');

    var query = {
        'autohide': 0,
        'showinfo': 1,
        'modestbranding': 1,
        'rel': 0,
        'version': 3,
        'enablejsapi': 1,
        'playlist': playlist
    };
    var queryString = querystring.stringify(query);

    return 'https://www.youtube.com/embed/' + firstId + '?' + queryString;
}

app.get('/hello', function(request, response) {
    response.render('index', {title: 'Hey', message: 'Hello there!'});
});

app.get('/', function(request, response) {
    var subreddit_list = getSubredditList();

    var subreddits_str = request.query.subreddits || null;
    if (!subreddits_str) {
        response.render('index', {title: 'Hey', message: 'Flock homepage'});
        return;
    }

    var sort = request.query.sort || 'hot';
    if (!(sort in SUPPORTED_SORTS)) {
        console.log('ERROR: No sort: %s', sort);
        response.redirect('/');
        return;
    }

    var t = request.query.t || 'week';
    if (!(t in SUPPORTED_TIMES)) {
        console.log('ERROR: Unsupported t: %s', t);
        response.redirect('/');
        return;
    }

    var limit = request.query.limit || 100;
    limit = parseInt(limit);
    if (limit !== limit) { // NaN check for non-int strings
        console.log('ERROR: Limit wasn\'t a number: %s', request.query.limit);
        response.redirect('/');
        return;
    }
    else if (limit < 0 || limit > 100) {
        console.log('ERROR: Limit out of range (0 <= limit <= 100): %d', limit);
        response.redirect('/');
        return;
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
        if (!links) {
            console.log('ERROR: No links found');
            response.render('index', {title: 'Hey', message: 'Flock homepage'});
            return;
        }

        var youTubeUrl = generateYouTubeUrl(links);

        response.render('index', {
            'title': 'Hey',
            'message': subreddits_str,
            'links': links,
            'youTubeUrl': youTubeUrl
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
