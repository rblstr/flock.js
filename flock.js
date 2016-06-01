var express = require('express');
var handlebars = require('express-handlebars');
var http = require('http');
var querystring = require('querystring');
var url = require('url');

var app = express();

app.use(express.static('static'));

app.engine('handlebars', handlebars({defaultLayout: 'main'}));
app.set('view engine', 'handlebars');

// TODO:
// * Modularise in a JavaScripthonic fashion
// * Check scope of all functions and variables
// * time.sleep for rate limited requests
// * In-place string formatting
// * filter() equiv

function topScore(link) {
    return (link.ups - link.downs);
}

function hotScore(link) {
    var score = link.ups - link.downs;
    var order = Math.log10(Math.max(Math.abs(score), 1));
    var sign = 0;
    if (score > 0) {
        sign = 1;
    } else if (score < 0) {
        sign = -1;
    }
    var seconds = link.created_utc - 1134028003;
    return sign * order + seconds / 45000;
}

function topSort(a, b) {
    return topScore(b) - topScore(a);
}

function hotSort(a, b) {
    return hotScore(b) - hotScore(a);
}

var SUPPORTED_SORTS = {
    'top': topSort,
    'hot': hotSort
};

var SUPPORTED_TIMES = {
    'day': null,
    'week': null,
    'month': null,
    'year': null,
    'all': null
};

function getSubredditList() {
    return ['metal'];
}

function makeRequest(options, done) {
    http.get(options, function(response) {
        done(null, response);
    }).on('error', function(error) {
        done(error, null);
    });
}

var rateLimitedRequests = {}; // Should be private to this module

function rateLimitedRequest(options, timeout, done) {
    var lastRequestTime = rateLimitedRequests[options.hostname] || new Date(0);
    var requestTime = new Date();

    var delta = requestTime.getTime() - lastRequestTime.getTime();

    var timeoutMillis = timeout * 1000;
    console.log("INFO: timeoutmillis: %d delta: %d", timeoutMillis, delta);

    var sleepTime = Math.max(timeoutMillis - delta, 0);
    console.log("INFO: rate limiting %s for %d seconds", options.hostname, sleepTime);

    setTimeout(function () {
        var requestTime = new Date();
        rateLimitedRequests[options.hostname] = requestTime;

        console.log("INFO: Requesting %s", options.path);
        makeRequest(options, done);
    }, sleepTime);

    console.log("INFO: rate limited requests", rateLimitedRequests);
}

function getRedditResponse(subreddits, sort, t, limit, done) {
    var query = querystring.stringify({
        't': t,
        'limit': limit
    });
    var path = '/r/' + subreddits.join('+') + '/' + sort + '.json?' + query;

    var options = {
        'hostname': 'www.reddit.com',
        'path': path,
        'headers': {
            'User-Agent': 'flock.js/0.0.0 by /u/rblstr'
        }
    };

    console.log('INFO: path: %s', path);

    rateLimitedRequest(options, 2, function (error, response) {
        if (error) {
            console.log('ERROR: %s', error.message);
            done(error, null);
            return;
        }

        console.log('INFO: Got Response:', response.statusCode);

        var data = '';
        response.on('data', function (chunk) {
            data += chunk;
        });

        response.on('end', function() {
            var error = null;
            var redditResponse;
            try {
                redditResponse = JSON.parse(data);
                if (redditResponse.error) {
                    console.log('ERROR: Error in reddit response: %s', redditResponse.error);
                    error = {
                        'redditResponseError': {
                            'message': redditResponse.error
                        }
                    };
                }
            } catch (e) {
                console.log('ERROR: JSON syntax error: %s', e.message);
                error = {
                    'jsonSyntaxError': {
                        'message': e.message
                    }
                };
            }
            done(error, redditResponse);
        });
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

function parseRedditResponse(redditResponse) {
    var children = [];
    var i, len;
    for (i = 0, len = redditResponse.data.children.length; i < len; ++i) {
        children.push(redditResponse.data.children[i].data);
    }
    console.log("INFO: %d children in reddit response", children.length);

    var links = [];
    for (i = 0, len = children.length; i < len; ++i) {
        var child = children[i];
        var sanitisedUrl = sanitiseUrl(child.url);
        if (!sanitisedUrl) {
            continue;
        }
        child.url = sanitisedUrl;
        child.permalink = 'http://www.reddit.com' + child.permalink;
        links.push(child);
    }

    console.log("INFO: Parsed %d links", links.length);
    return links;
}

function getLinks (subreddits, sort, t, done) {
    getRedditResponse(subreddits, sort, t, 100, function(error, redditResponse) {
        if (error) {
            done(error, null);
            return;
        }

        var links = parseRedditResponse(redditResponse);
        done(null, links);
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
    }

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

app.get('/', function(request, response) {
    var subredditList = getSubredditList();

    var subredditsString = request.query.subreddits || null;
    if (!subredditsString) {
        response.render('home', {title: 'Hey', message: 'Flock homepage'});
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

    var selectedSubreddits = subredditsString.split(' ');
    var lowerSubredditList = [];
    var i = 0;
    for (i = 0, len = subredditList.length; i < len; ++i) {
        lowerSubredditList.push(subredditList[i].toLowerCase());
    }
    for (i = 0, len = selectedSubreddits.length; i < len; i++) {
        var subreddit = selectedSubreddits[i];
        if (lowerSubredditList.indexOf(subreddit.toLowerCase())=== -1) {
            subredditList.push(subreddit);
        }
    }

    console.log('INFO: subreddit list:', subredditList);
    console.log('INFO: t: %s', t);
    console.log('INFO: subreddits', selectedSubreddits);

    getLinks(selectedSubreddits, sort, t, function(error, links) {
        if (error) {
            console.log('ERROR: No links found');
            response.render('home', {title: 'Hey', message: 'Flock homepage'});
            return;
        }

        console.log("INFO: sort: %s", sort);
        var sortFunc = SUPPORTED_SORTS[sort];
        function sortByFunc (a, b) {
            var result = sortFunc(a, b);
            if (result) {
                return result;
            }

            // If tie, sort by creation time
            return a.created_utc - b.created_utc;
        }
        links.sort(sortByFunc);

        console.log('INFO: limit: %d', limit);
        links = links.slice(0, limit);

        var youTubeUrl = generateYouTubeUrl(links);

        response.render('home', {
            'title': 'Hey',
            'links': links,
            'youTubeUrl': youTubeUrl,
            'selectedSubreddits': selectedSubreddits.join(' ')
        });
    });
});

var server = app.listen(3000, function() {
    var host = server.address().address;
    var port = server.address().port;

    console.log('Example app listening at http://%s:%s', host, port);
});
