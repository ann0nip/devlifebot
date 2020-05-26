const axios = require('axios');
const cheerio = require('cheerio');
const dotenv = require('dotenv');
const fs = require('fs');
const request = require('request-promise');
const twit = require('twit')

dotenv.config();

var T = new twit({
  consumer_key: process.env.CONSUMER_KEY,
  consumer_secret: process.env.CONSUMER_SECRET,
  access_token: process.env.ACCESS_TOKEN,
  access_token_secret: process.env.ACCESS_TOKEN_SECRET,
})

async function startScraping(callback) {

  /* Send the request to the user page and get the results */
  const response = await request(process.env.URL);
  /* Start processing the response */
  const $ = cheerio.load(response);

  const mediaType = $('.blog-post-content').children().children()[0].name

  /* Parse details from the html with query selectors */
  const title = $('h1.single-blog-post-title').text();

  let videoSrc, timeSize;

  if (mediaType === 'video') {
    videoSrc = $('.blog-post-content video source').next().attr('src')
    timeSize = 4000
  } else {
    videoSrc = $('.blog-post-content p img').attr('data-src')
    timeSize = 6000
  }
  const videoSrcSplit = videoSrc.split("/");
  const videoName = videoSrcSplit[videoSrcSplit.length - 1];


  const file = fs.createWriteStream(`./videos/${videoName}`);

  file.on('finish', function () {
    // pipe done here, do something with file
  });

  try {
    axios({
      method: 'get',
      url: videoSrc,
      responseType: 'stream'
    }).then(res => res.data.pipe(file))
      .then(() => {
        setTimeout(() => {
          callback({ title, videoName })
        }, timeSize);
      })
      .catch(err => console.log("Axios Err: " + err));
  } catch (error) {
    console.log("Https: " + error);
  }
}



T.get('account/verify_credentials', {
  include_entities: false,
  skip_status: true,
  include_email: false
})

var stream = T.stream('statuses/filter', { track: '@DevlifeBot' });
stream.on('tweet', tweetEvent);

function tweetEvent(tweet) {
  var name = tweet.user.screen_name;
  var nameID = tweet.id_str;

  startScraping(({ title, videoName }) => {

    const file_path = "./videos/" + videoName;

    T.postMediaChunked({ file_path }, function (err, data, response) {

      if (!err) {
        const mediaIdStr = data.media_id_string;
        const meta_params = { media_id: mediaIdStr };

        T.post('media/metadata/create', meta_params, function (err, data, response) {

          if (!err) {
            const reply = "@" + name + " " + title;
            const params = {
              status: reply,
              in_reply_to_status_id: nameID,
              media_ids: [mediaIdStr]
            };

            T.post('statuses/update', params, function (err, tweet, response) {

              if (!err) {
                console.log('Tweeted 🚀 ');
              } else {
                console.log("Create Tweet error " + err)
              }
            });

          } else {
            console.log("Create Media Tweet error " + err)
          }
        });

      } else {
        console.log("PostMediaChunked error " + err)
      }
    });
  })
};