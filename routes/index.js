var express = require('express');
var router = express.Router();

// The homepage of the site
router.get('/', restrict, function(req, res, next) {
	var db = req.db;
	var config = require('./config');
	
	// get the top 5 results based on viewcount
	db.kb.find({kb_published:'true'}).sort({kb_viewcount: -1}).limit(config.settings.num_top_results).exec(function (err, top_results) {
 		res.render('index', { 
			 title: 'openKB', 
			 "top_results": top_results, 
			 session: req.session,
			 config: config
		});
	});
});

router.get('/kb/:id', restrict, function(req, res) {
  var db = req.db;
  var marked = req.marked;
  var helpers = req.handlebars.helpers;
  var config = require('./config');
  
  db.kb.findOne({_id: req.params.id}, function (err, result) {
	// add to old view count
	var old_viewcount = result.kb_viewcount;
	if(old_viewcount == null){
		old_viewcount = 0;
	}
	var new_viewcount = old_viewcount + 1;
	
	db.kb.update({ _id: req.params.id }, 
		{ 
			$set: { kb_viewcount:  new_viewcount} 
		}, { multi: false }, function (err, numReplaced) {
		// show the view
		res.render('kb', { 
			title: result.kb_title, 
			"result": result,
			"kb_body": marked(result.kb_body),
			config: config,
			session: req.session,
			helpers: helpers
		});
	});
  });
});

// render the editor
router.get('/edit/:id', restrict, function(req, res) {
  var db = req.db;
  var config = require('./config');
  
  db.kb.findOne({_id: req.params.id}, function (err, result) {
	res.render('edit', { 
		title: 'Edit article', 
		"result": result,
		session: req.session,
		config: config,
		message: clear_session_value(req.session, "message"),
		message_type: clear_session_value(req.session, "message_type"),
		helpers: req.handlebars.helpers
	});
  });
});

// insert new KB form action
router.post('/insert_kb', restrict, function(req, res) {
  	var db = req.db;
  
  	var published_state = "false";
	if(req.body.frm_kb_published == "on"){
		published_state = "true";
	}
	
    var doc = { 
        kb_title: req.body.frm_kb_title,
		kb_body: req.body.frm_kb_body,
		kb_published: published_state,
		kb_keywords: req.body.frm_kb_keywords
	};

	db.kb.insert(doc, function (err, newDoc) {
		if(err){
			console.log(err);
		}else{
			res.redirect('/kb/' + newDoc._id);
		}
	});
});

// Update an existing KB article form action
router.post('/save_kb', restrict, function(req, res) {
  	var db = req.db;
	
	var published_state = "false";
	if(req.body.frm_kb_published == "on"){
		published_state = "true";
	}
 
	db.kb.update({_id: req.body.frm_kb_id},{ $set: 
			{   kb_title: req.body.frm_kb_title,
				kb_body: req.body.frm_kb_body,
				kb_published: published_state,
				kb_keywords: req.body.frm_kb_keywords
			}
		}, {},  function (err, numReplaced) {
		if(err){
			req.session.message = "Failed to save. Please try again";
			req.session.message_type = "danger";
		}else{
			req.session.message = "Successfully saved";
			req.session.message_type = "success";
			res.redirect('/edit/' + req.body.frm_kb_id);
		}
	});
});

// logout
router.get('/logout', function(req, res) {
  	req.session.user = null;
	req.session.message = null;
	req.session.message_type = null;
	res.redirect('/');
});

// users
router.get('/users', restrict, function(req, res) {
	var config = require('./config');
	
	req.db.users.find({}, function (err, users) {
		res.render('users', { 
		  	title: 'Users',
			users: users,
			config: config,
			is_admin: req.session.is_admin,
			helpers: req.handlebars.helpers,
			session: req.session
		});
	});
});

// users
router.get('/user/edit/:id', restrict, function(req, res) {
	var config = require('./config');
	
	req.db.users.findOne({_id: req.params.id}, function (err, user) {
		res.render('user_edit', { 
		  	title: 'User edit',
			user: user,
			session: req.session,
			config: config,
			message: clear_session_value(req.session, "message"),
			message_type: clear_session_value(req.session, "message_type")
		});
	});
});

// users
router.get('/users/new', restrict, function(req, res) {
	var config = require('./config');
		
	req.db.users.findOne({_id: req.params.id}, function (err, user) {
		res.render('user_new', { 
		  	title: 'User - New',
			user: user,
			session: req.session,
			config: config,
			message: clear_session_value(req.session, "message"),
			message_type: clear_session_value(req.session, "message_type")
		});
	});
});

// kb list
router.get('/articles', restrict, function(req, res) {
	var config = require('./config');
	
	req.db.kb.find({}, function (err, articles) {
		res.render('articles', { 
		  	title: 'Articles',
			articles: articles,
			session: req.session,
			config: config,
			helpers: req.handlebars.helpers
		});
	});
});

// update the published state based on an ajax call from the frontend
router.post('/published_state', restrict, function(req, res) {
	req.db.kb.update({ _id: req.body.id}, 
		{ 
			$set: { 
				kb_published: req.body.state
			} 
		}, { multi: false }, function (err, numReplaced) {
			console.log(err);
	});
});	

// insert a user
router.post('/user_insert', restrict, function(req, res) {
  	var db = req.db;
	var bcrypt = req.bcrypt;
	var url = require('url');
	
	// set the account to admin if using the setup form. Eg: First user account
	var url_parts = url.parse(req.header('Referer'));
	var is_admin = "false";
	if(url_parts.path == "/setup"){
		is_admin = "true";
	}
	
	var doc = { 
        user_email: req.body.user_email,
		user_password: bcrypt.hashSync(req.body.user_password),
		is_admin: is_admin
	};
	
	db.users.insert(doc, function (err, doc) {
		// show the view
		if(err){
			req.session.message = "User exists";
			req.session.message_type = "danger";
			res.redirect('/user/edit/' + doc._id);
		}
		req.session.message = "User account inserted.";
		req.session.message_type = "success";
		res.redirect('/user/edit/' + doc._id);
	});
});

// update a user
router.post('/user_update', restrict, function(req, res) {
  	var db = req.db;
	var bcrypt = req.bcrypt;
	
	db.users.update({ _id: req.body.user_id }, 
		{ 
			$set: { 
				user_password: bcrypt.hashSync(req.body.user_password)
			} 
		}, { multi: false }, function (err, numReplaced) {
		
		// show the view
		req.session.user = req.body.user_email;
		req.session.message = "User account updated.";
		req.session.message_type = "success";
		res.redirect('/user/edit/' + req.body.user_id);
	});
});

// login form
router.get('/login', function(req, res) {
	var config = require('./config');
	
	req.db.users.count({}, function (err, user_count) {  
		// we check for a user. If one exists, redirect to login form otherwise setup
		if(user_count > 0){
			res.render('login', { 
			  	title: 'Login', 
				referring_url: req.header('Referer'),
				config: config,
				message: clear_session_value(req.session, "message"), 
				message_type: clear_session_value(req.session, "message_type")
			});
		}else{
			res.redirect('/setup');
		}
	});
});

// setup form is shown when there are no users setup in the DB
router.get('/setup', function(req, res) {
	var config = require('./config');
	
	req.db.users.count({}, function (err, user_count) {
		// dont allow the user to "re-setup" if a user exists.
		if(user_count == 0){
			res.render('setup', { 
			  	title: 'Setup', 
				config: config,
				message: clear_session_value(req.session, "message"), 
				message_type: clear_session_value(req.session, "message_type")
			});
		}else{
			res.redirect('/login');
		}
	});
});

// login the user and check the password
router.post('/login_action', function(req, res){
    var db = req.db;
	var bcrypt = req.bcrypt;
	var url = require('url');
	
	db.users.findOne({user_email: req.body.email}, function (err, user) {  

		// check if user exists with that email
		if(user === undefined || user === null){
			req.session.message = "A user with that email does not exist.";
			req.session.message_type = "danger";
			res.redirect('/login');
		}else{
			// we have a user under that email so we compare the password
			if(bcrypt.compareSync(req.body.password, user.user_password) == true){
				req.session.user = req.body.email;
				req.session.user_id = user._id;
				req.session.is_admin = user.is_admin;
				if(req.body.frm_referring_url === undefined || req.body.frm_referring_url == ""){
					res.redirect('/');
				}else{
					var url_parts = url.parse(req.body.frm_referring_url, true);
					if(url_parts.pathname == "setup" || url_parts.pathname == "login"){
						res.redirect(req.body.frm_referring_url);
					}else{
						res.redirect('/');
					}
				}
			}else{
				// password is not correct
				req.session.message = "Access denied. Check password and try again.";
				req.session.message_type = "danger";
				res.redirect('/login');
			}
		}
	});
});

// delete user
router.get('/user/delete/:id', restrict, function(req, res) {
  	var db = req.db;
	
	// remove the article
	if(req.session.is_admin == "true"){
		db.users.remove({_id: req.params.id}, {}, function (err, numRemoved) {			
			req.session.message = "User deleted.";
			req.session.message_type = "success";
			res.redirect("/users");
	  	});
	}else{
		req.session.message = "Access denied.";
		req.session.message_type = "danger";
		res.redirect("/users");
	}
});

// delete article
router.get('/delete/:id', restrict, function(req, res) {
  	var db = req.db;
	
	// remove the article
	db.kb.remove({_id: req.params.id}, {}, function (err, numRemoved) {
		res.redirect('/');
  	});
});

// insert form
router.get('/insert', restrict, function(req, res) {
	var config = require('./config');
	
	res.render('insert', {
		title: 'Insert new', 
		session: req.session,
		config: config
	});
});

// search kb's
router.get('/search/:tag', restrict, function(req, res) {
	var db = req.db;
	var search_term = req.params.tag;
	var config = require('./config');
  
	// we search on the keywords and the title for the search text
	db.kb.find({'$or':[{kb_keywords:new RegExp(search_term,'i')},{kb_title:new RegExp(search_term,'i')}], kb_published:'true'}).exec(function(err, results) {
		res.render('index', { 
			title: 'Results', 
			"results": results, 
			session: req.session, 
			search_term: search_term,
			config: config
		});
	});
});

// search kb's
router.post('/search', restrict, function(req, res) {
	var db = req.db;
	var search_term = req.body.frm_search;
	var config = require('./config');
	
	// we search on the keywords and the title for the search text
	db.kb.find({'$or':[{kb_keywords:new RegExp(search_term,'i')},{kb_title:new RegExp(search_term,'i')}], kb_published:'true'}).exec(function(err, results) {
		res.render('index', { 
			title: 'Results', 
			"results": results, 
			session: req.session, 
			search_term: search_term,
			config: config
		});
	});
});

function clear_session_value(session, session_var){
	if(session_var == "message"){
		var sess_message = session.message;
		session.message = null;
		return sess_message;
	}
	if(session_var == "message_type"){
		var sess_message_type = session.message_type;
		session.message_type = null;
		return sess_message_type;
	}
}

// This is called on all URL's. If the "password_protect" config is set to true
// we check for a login on thsoe normally public urls. All other URL's get
// checked for a login as they are considered to be protected. The only exception
// is the "setup", "login" and "login_action" URL's which is not checked at all.
function restrict(req, res, next){
	var config = require('./config');
	var url = require('url');
	var url_parts = url.parse(req.url);
				
	// if not protecting we check for public pages and don't check_login
	if(url_parts.path == "/"){
		if(config.settings.password_protect == false){
			next();
			return;
		}
	}
	if(url_parts.path.indexOf("/search") > -1){
		if(config.settings.password_protect == false){
			next();
			return;
		}
	}
	if(url_parts.path.indexOf("/kb") > -1){
		if(config.settings.password_protect == false){
			next();
			return;
		}
	}
	
	// if not a public page we check_login
	check_login(req, res, next);
}

// does the actual login check
function check_login(req, res, next){
	if(req.session.user){
		next();
	}else{
		res.redirect('/login');
	}
}

module.exports = router;
