var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var handlebars = require('express-handlebars');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var Nedb = require('nedb');
var session = require('express-session');
var bcrypt = require('bcrypt-nodejs');
var lunr = require('lunr');
var markdownit = require('markdown-it')({html: true, linkify: true, typographer: true});
var moment = require('moment');
var Nedb_store = require('nedb-session-store')(session);
var config = require('./routes/config');

// setup the db's
var db = new Nedb();
db = {};
db.users = new Nedb({filename: path.join(__dirname, '/data/users.db'), autoload: true});
db.kb = new Nedb({filename: path.join(__dirname, '/data/kb.db'), autoload: true});

// setup lunr indexing
var lunr_index = lunr(function (){
    this.field('kb_title', {boost: 10});
    this.field('kb_keywords');
});

// get all articles on startup
db.kb.find({}, function (err, kb_list){
    // add to lunr index
    kb_list.forEach(function(kb){
        // only if defined
        var keywords = '';
        if(kb.kb_keywords !== undefined){
            keywords = kb.kb_keywords.toString().replace(/,/g, ' ');
        }
        var doc = {
            'kb_title': kb.kb_title,
            'kb_keywords': keywords,
            'id': kb._id
        };
        lunr_index.add(doc);
    });
});

// require the routes
var index = require('./routes/index');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, '/views'));
app.engine('hbs', handlebars({extname: 'hbs', layoutsDir: path.join(__dirname, '/views/layouts'), defaultLayout: 'layout.hbs'}));
app.set('view engine', 'hbs');

// helpers for the handlebar templating platform
handlebars = handlebars.create({
    helpers: {
        split_keywords: function (keywords){
            if(keywords){
                var array = keywords.split(','); var links = '';
                for(var i = 0; i < array.length; i++){
                    if(array[i].trim() !== ''){
                        links += "<a href='/search/" + array[i].trim() + "'>" + array[i].trim() + '</a>&nbsp;|&nbsp;';
                    }
                }return links.substring(0, links.length - 1);
            }
            return keywords;
        },

        encodeURI: function(url){
            return encodeURI(url);
        },
        checked_state: function (state){
            if(state === 'true'){
                return'checked';
            }
            return'';
        },
        view_count: function(value){
            if(value === '' || value === undefined){
                return'0';
            }
            return value;
        },
        format_date: function(date){
            if(config.settings.date_format){
                return moment(date).format(config.settings.date_format);
            }
            return moment(date).format('DD/MM/YYYY h:mmA');
        },
        ifCond: function(v1, operator, v2, options){
			switch(operator){
				case'==':
					return(v1 === v2) ? options.fn(this) : options.inverse(this);
				case'!=':
					return(v1 !== v2) ? options.fn(this) : options.inverse(this);
				case'===':
					return(v1 === v2) ? options.fn(this) : options.inverse(this);
				case'<':
					return(v1 < v2) ? options.fn(this) : options.inverse(this);
				case'<=':
					return(v1 <= v2) ? options.fn(this) : options.inverse(this);
				case'>':
					return(v1 > v2) ? options.fn(this) : options.inverse(this);
				case'>=':
					return(v1 >= v2) ? options.fn(this) : options.inverse(this);
				case'&&':
					return(v1 && v2) ? options.fn(this) : options.inverse(this);
				case'||':
					return(v1 || v2) ? options.fn(this) : options.inverse(this);
				default:
					return options.inverse(this);
			}
		},
        is_an_admin: function (value, options){
            if(value === 'true'){
                return options.fn(this);
            }
            return options.inverse(this);
        }
    }
});

// uncomment after placing your favicon in /public
app.use(favicon(path.join(__dirname, '/public/favicon.ico')));
app.enable('trust proxy');
app.set('port', process.env.PORT || 4444);
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser('5TOCyfH3HuszKGzFZntk'));
app.use(session({
    resave: false,
    saveUninitialized: true,
    secret: 'pAgGxo8Hzg7PFlv1HpO8Eg0Y6xtP7zYx',
    cookie: {
        path: '/',
        httpOnly: true,
        maxAge: 3600000 * 24
    },
    store: new Nedb_store({
        filename: 'data/sessions.db'
    })
}));

// frontend modules loaded from NPM
app.use('/static', express.static(path.join(__dirname, 'public/')));
app.use('/font-awesome', express.static(path.join(__dirname, 'node_modules/font-awesome/')));
app.use('/jquery', express.static(path.join(__dirname, 'node_modules/jquery/dist/')));
app.use('/bootstrap', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/')));
app.use('/simplemde', express.static(path.join(__dirname, 'node_modules/simplemde/dist/')));
app.use('/markdown-it', express.static(path.join(__dirname, 'node_modules/markdown-it/dist/')));
app.use('/stylesheets', express.static(path.join(__dirname, 'public/stylesheets')));
app.use('/fonts', express.static(path.join(__dirname, 'public/fonts')));
app.use('/javascripts', express.static(path.join(__dirname, 'public/javascripts')));
app.use('/favicon.ico', express.static(path.join(__dirname, 'public/favicon.ico')));

// serving static content
app.use(express.static(path.join(__dirname, 'public')));

// Make stuff accessible to our router
app.use(function (req, res, next){
	req.db = db;
	req.markdownit = markdownit;
	req.handlebars = handlebars.helpers;
    req.bcrypt = bcrypt;
    req.lunr_index = lunr_index;
	next();
});

// setup the routes
app.use('/', index);

// catch 404 and forward to error handler
app.use(function(req, res, next){
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// === Error handlers ===

// development error handler
// will print stacktrace
if(app.get('env') === 'development'){
    app.use(function (err, req, res, next){
        console.log(err.stack);
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next){
    console.log(err.stack);
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

// lift the app
app.listen(app.get('port'), function (){
    console.log('openKB running on host: http://localhost:' + app.get('port'));
});

module.exports = app;
