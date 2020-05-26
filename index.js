const axios = require('axios');
const cheerio = require('cheerio');
const dotenv = require('dotenv');
const fs = require('fs');
const request = require('request-promise');
const twit = require('twit')

dotenv.config();

if (!fs.existsSync("./media")) {
  fs.mkdirSync("./media");
}

const T = new twit({
  consumer_key: process.env.CONSUMER_KEY,
  consumer_secret: process.env.CONSUMER_SECRET,
  access_token: process.env.ACCESS_TOKEN,
  access_token_secret: process.env.ACCESS_TOKEN_SECRET,
})

T.get('account/verify_credentials', {
  include_entities: false,
  skip_status: true,
  include_email: false
})

async function startScraping(callback) {

  /* Send the request to the user page and get the results */
  const response = await request(process.env.URL);
  /* Start processing the response */
  const $ = cheerio.load(response);

  /* Form the scrapped  site, sometime we get a video or an img so we need figure out */
  const mediaType = $('.blog-post-content').children().children()[0].name

  /* Parse details from the html with query selectors */
  const title = $('h1.single-blog-post-title').text();

  let mediaSrc;

  if (mediaType === 'video') {
    mediaSrc = $('.blog-post-content video source').next().attr('src')
  } else {
    mediaSrc = $('.blog-post-content p img').attr('data-src')
  }

  const mediaSrcSplit = mediaSrc.split("/");
  const mediaName = mediaSrcSplit[mediaSrcSplit.length - 1];

  const file = fs.createWriteStream(`./media/${mediaName}`);

  file.on('finish', () => {
    console.log("file saved");
    callback({ title, mediaName })
  });

  axios({
    method: 'get',
    url: mediaSrc,
    responseType: 'stream'
  }).then(res => res.data.pipe(file))
    .catch(err => console.log("Axios Err: " + err));
}

const stream = T.stream('statuses/filter', { track: '@DevlifeBot' });
stream.on('tweet', tweetEvent);

function tweetEvent(tweet) {
  const name = tweet.user.screen_name;
  const nameID = tweet.id_str;

  startScraping(({ title, mediaName }) => {

    const file_path = "./media/" + mediaName;

    T.postMediaChunked({ file_path }, (err, data, response) => {

      if (!err) {
        const mediaIdStr = data.media_id_string;
        const meta_params = { media_id: mediaIdStr };

        T.post('media/metadata/create', meta_params, (err, data, response) => {

          if (!err) {
            const reply = "@" + name + " " + title;
            const params = {
              status: reply,
              in_reply_to_status_id: nameID,
              media_ids: [mediaIdStr]
            };

            T.post('statuses/update', params, (err, tweet, response) => {

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