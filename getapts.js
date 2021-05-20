#!/usr/bin/env node
const https = require("https");

const { secrets } = require('./secrets');

// For SMS sending
const Vonage = require('@vonage/server-sdk')

const vonage = new Vonage({
    apiKey: secrets.key,
    apiSecret: secrets.secret
})

function sendSms(text, to, cb) {
    const from = "18444875228"

    vonage.message.sendSms(from, to, text, (err, responseData) => {
        if (err) {
            console.log(err);
        } else {
            if (responseData.messages[0]['status'] === "0") {
                console.log("Message sent successfully.");
            } else {
                console.log(`Message failed with error: ${responseData.messages[0]['error-text']}`);
            }
        }
        if (!!cb) {
            cb();
        }
    })
}

if (process.argv[2] == 'help') {
    console.log(`
Usage: node getapts.js <max_date> <sms_phone_number>
  <max_date>          YYYY-MM-DD
  <sms_phone_number>  10-digit phone number that can receive SMS`);
    process.exit(0);
}

// const latestDate = new Date('2021-05-30');
const latestDate = new Date(process.argv[2]);

const errors = []

if (latestDate < new Date()) {
    errors.push('<max_date> must be in the future.')
}

// e.g. 17142223333
const to = process.argv[3];
if (!/^\d{10}$/.test(to)) {
    errors.push('<sms_phone_number> must be 10 digits.')
}

if (errors.length > 0) {
    throw errors.join('\n');
}

// TODO allow user to select from human friendly list which locations to poll
const validLocIds = [
    58,
    67,
    59,
    55,
    61,
    56,
    57,
    53,
    60,
    47,
    63,
    52,
    46,
    54,
    51,
]

function getAptsData(callback) {
    https
        .get("https://telegov.njportal.com/njmvc/AppointmentWizard/7", (resp) => {
            let data = "";

            // A chunk of data has been received.
            resp.on("data", (chunk) => {
                data += chunk;
            });

            // The whole response has been received. Print out the result.
            resp.on("end", () => {
                callback(null, data);
            });
        })
        .on("error", (err) => {
            callback(err);
        });
}


const aptsDataCallback = ((err, data) => {
    if (err) {
        console.error(err);
        return;
    }
    const locraw = data.split('\r\n').filter(x => x.includes('locationModel = '))[0].substr(28)
    const locationModel = JSON.parse(locraw.substr(0, locraw.length - 21))
    timeData = JSON.parse(
        data
            .split("\r\n")
            .filter((x) => x.includes("timeData = "))[0]
            .substr(23)
    )
        .filter((x) => x.FirstOpenSlot.includes("Next Available"))
        .filter((x) => {
            const id = locationModel.filter(y => y.Id == x.LocationId)[0].Id;
            return validLocIds.includes(id);
        })
        .map((x) => {
            const location = locationModel.filter(y => y.Id == x.LocationId)[0];
            const nextAvailable = new Date(x.FirstOpenSlot.substr(-19));
            const d = nextAvailable.toISOString().substr(0, 10);
            const h = '0' + nextAvailable.getHours();
            const m = '0' + nextAvailable.getMinutes();
            const signupLink = `https://telegov.njportal.com/njmvc/AppointmentWizard/7/${x.LocationId}/${d}/${h.substr(-2)}${m.substr(-2)}`;
            return {
                locationId: x.LocationId,
                locName: location.Name,
                locCity: location.City,
                nextAvailable,
                signupLink,
            };
        })
        .sort((a, b) => a.nextAvailable > b.nextAvailable)
        .filter(x => x.nextAvailable < latestDate);

    var example = [
        {
            LocationId: 48,
            FirstOpenSlot:
                "16 Appointments Available <br/> Next Available: 07/16/2021 12:00 PM",
        },
    ];
    // https://telegov.njportal.com/njmvc/AppointmentWizard/7/48/2021-07-16/1200

    if (timeData.length > 0) {
        console.log('WE HAVE A WINNER!!!')
        var links = timeData.map(x => x.signupLink).join(' \n') + "    (end)"
        sendSms(links, to, () => {
            process.exit(0)
        });
    } else {
        console.log('No openings found within time and location constraints.')
    }
});

getAptsData(aptsDataCallback);

setInterval(() => {
    getAptsData(aptsDataCallback);
}, 20000);
