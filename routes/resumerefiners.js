const express    = require("express"),
      router     = express.Router(),
      ResumeRefiner = require("../models/resumerefiner"),
      middleware = require("../middleware"), // automatically looks for index.js
      geocoder   = require("geocoder"),
      multer     = require('multer'),
      cloudinary = require('cloudinary');

// =========== Image Upload Configuration =============
//multer config
const storage = multer.diskStorage({
  filename: function(req, file, callback) {
    callback(null, Date.now() + file.originalname);
  }
});
const imageFilter = (req, file, cb) => {
    // accept image files only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
        return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
};
const upload = multer({ storage: storage, fileFilter: imageFilter});

// cloudinary config
cloudinary.config({
  cloud_name: 'yelpResumecloud',
  api_key: 584718626928737,
  api_secret: process.env.APISECRET
});

// ============= ROUTES ==============
// Define escapeRegex function to avoid regex DDoS attack
const escapeRegex = text => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");

// INDEX -show all ResumeRefiners
router.get("/", (req, res) => {
  let noMatch = null;
  if (req.query.search) {
    const regex = new RegExp(escapeRegex(req.query.search), 'gi');
    ResumeRefiner.find({name: regex}, function(err, allResumeRefiners) {
      if (err) { console.log(err); }
      else {
        if (allResumeRefiners.length < 1) {
          noMatch = "No ResumeRefiners found, please try again.";
        }
        res.render("ResumeRefiners/index", { ResumeRefiners: allResumeRefiners, page: "ResumeRefiners", noMatch: noMatch });
      }
    });
  } else {
    // Get all camRefiners from DB
    ResumeRefiner.find({}, function(err, allResumeRefiners) {
      if (err) { console.log(err); }
      else {
        res.render("ResumeRefiners/index", { ResumeRefiners: allResumeRefiners, page: "ResumeRefiners", noMatch: noMatch });
      }
    });
  }
});

// CREATE - add new ResumeRefiner to DB
router.post("/", middleware.isLoggedIn, upload.single('image'), (req, res) => {
  // cloudinary
  cloudinary.uploader.upload(req.file.path, (result) => {
     // get data from the form
    let { name, image, price, description, author } = {
      name: req.body.name,
      image: {
        // add cloudinary public_id for the image to the ResumeRefiner object under image property
        id: result.public_id,
        // add cloudinary url for the image to the ResumeRefiner object under image property
        url: result.secure_url
      },
      price: req.body.price,
      description: req.body.description,
      // get data from the currenly login user
      author: {
        id: req.user._id,
        username: req.user.username
      }
    };

    // geocoder for Google Maps
    geocoder.geocode(req.body.location, (err, data) => {
      if (err) throw err;
      let lat = data.results[0].geometry.location.lat,
          lng = data.results[0].geometry.location.lng,
          location = data.results[0].formatted_address;
      let newResumeRefiner = { name, image, price, description, author, location, lat, lng };

      // create a new ResumeRefiner and save to DB
      ResumeRefiner.create(newResumeRefiner, (err, newlyCreated) => {
        if (err) { console.log(err); }
        else {
          // redirect back to ResumeRefiner page
          res.redirect("/ResumeRefiners");
        }
      });
    });
  });
});

// NEW
router.get("/new", middleware.isLoggedIn, (req, res) => res.render("ResumeRefiners/new"));

// SHOW - shows more info about one ResumeRefiner
router.get("/:id", (req, res) => {
  //find the ResumeRefiner with provided id in DB
  ResumeRefiner.findById(req.params.id).populate("comments").exec((err, foundResumeRefiner) => {
    if (err || !foundResumeRefiner) {
      req.flash("error", "ResumeRefiner not found");
      res.redirect("back");
    } else {
      //render show template with that ResumeRefiner
      res.render("ResumeRefiners/show", { ResumeRefiner: foundResumeRefiner });
    }
  });
});

// edit ResumeRefiner route
// store original image id and url
let imageId, imageUrl;
router.get("/:id/edit", middleware.checkResumeRefinerOwenership, (req, res) => {
  ResumeRefiner.findById(req.params.id, (err, foundResumeRefiner) => {
    imageId = foundResumeRefiner.image.id;
    imageUrl = foundResumeRefiner.image.url;
    if (err) { res.redirect("/ResumeRefiners") }
    else { res.render("ResumeRefiners/edit", { ResumeRefiner: foundResumeRefiner }); }
  });
});

// update ResumeRefiner route
router.put("/:id", middleware.checkResumeRefinerOwenership, upload.single('image'), (req, res) => {
  // if no new image to upload
  if (!req.file) {
    let { name, image, price, description, author } = {
      name: req.body.ResumeRefiner.name,
      image: {
        // add cloudinary public_id for the image to the ResumeRefiner object under image property
        id: imageId,
        // add cloudinary url for the image to the ResumeRefiner object under image property
        url: imageUrl
      },
      price: req.body.ResumeRefiner.price,
      description: req.body.ResumeRefiner.description,
      // get data from the currenly login user
      author: {
        id: req.user._id,
        username: req.user.username
      }
    };
    geocoder.geocode(req.body.ResumeRefiner.location, (err, data) => {
      if (err) throw err;
      let lat = data.results[0].geometry.location.lat,
          lng = data.results[0].geometry.location.lng,
          location = data.results[0].formatted_address;
      let newData = { name, image, price, description, author, location, lat, lng };

      //find and update the correct ResumeRefiner
      ResumeRefiner.findByIdAndUpdate(req.params.id, {$set: newData}, (err, updatedResumeRefiner) => {
        if (err) {
          req.flash("error", err.message);
          res.redirect("/ResumeRefiners");
        } else {
          //redirect somewhere(show page)
          req.flash("success","ResumeRefiner Updated!");
          res.redirect("/ResumeRefiners/" + req.params.id);
        }
      });
    });
  } else {
    // cloudinary
    cloudinary.uploader.upload(req.file.path, (result) => {
      let { name, image, price, description, author } = {
        name: req.body.ResumeRefiner.name,
        image: {
          // add cloudinary public_id for the image to the ResumeRefiner object under image property
          id: result.public_id,
          // add cloudinary url for the image to the ResumeRefiner object under image property
          url: result.secure_url
        },
        price: req.body.ResumeRefiner.price,
        description: req.body.ResumeRefiner.description,
        // get data from the currenly login user
        author: {
          id: req.user._id,
          username: req.user.username
        }
      };

      // remove original/old ResumeRefiner image on cloudinary
      cloudinary.uploader.destroy(imageId, (result) => { console.log(result) });

      geocoder.geocode(req.body.ResumeRefiner.location, (err, data) => {
        if (err) throw err;
        let lat = data.results[0].geometry.location.lat,
            lng = data.results[0].geometry.location.lng,
            location = data.results[0].formatted_address;
        let newData = { name, image, price, description, author, location, lat, lng };

        //find and update the correct ResumeRefiner
        ResumeRefiner.findByIdAndUpdate(req.params.id, {$set: newData}, (err, updatedResumeRefiner) => {
          if (err) {
            req.flash("error", err.message);
            res.redirect("/ResumeRefiners");
          } else {
            //redirect somewhere(show page)
            req.flash("success","ResumeRefiner Updated!");
            res.redirect("/ResumeRefiners/" + req.params.id);
          }
        });
      });
    });
  }
});

// destroy ResumeRefiner route
router.delete("/:id", middleware.checkResumeRefinerOwenership, (req, res) => {
  ResumeRefiner.findByIdAndRemove(req.params.id, err => {
    if (err) { res.redirect("/ResumeRefiners"); }
    else {
      req.flash("success", "ResumeRefiner removed!");
      res.redirect("/ResumeRefiners"); }
  });
});

module.exports = router;
