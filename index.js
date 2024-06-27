//Express setup
const express = require('express');
const app = express();

//ejs setup
app.set('view engine', 'ejs');
app.use(express.static('public'))

//Create http server
const http = require('http');
const server = http.createServer(app);

//Socket IO
const { Server } = require('socket.io');
const io = new Server(server);

//sqlite setup
const sql = require('sqlite3').verbose();

//Server Variables
const WEB_PORT = 32000;

//Globals
let max_id = 0;
let current_weight = 0;
let age = 0;
let BMR = 0; // Basal Metabolic Rate
let today_calories = 0;
let calorie_diff = 0;

//Constants
const birthday = new Date('02/09/1996')
const height = 180.333 //in centimeters

//create and connect to database file
const db = new sql.Database('./db/diet.db', sql.OPEN_READWRITE, (err) => {
    if (err) return console.error(err.message)
    console.log('Connection to DB Successful')
});

//Setup the "entries" table if it does not exist already
db.run("CREATE TABLE IF NOT EXISTS entries(id, entry_date, entry_time, entry_name, entry_calories, weight)");

//SQL Quarry templates
const SQL_INSERT = 'INSERT INTO entries(id, entry_date, entry_time, entry_name, entry_calories, weight) VALUES(?,?,?,?,?,?)';
const SQL_GETHIGH = 'SELECT * FROM entries ORDER BY id DESC LIMIT 1'
const SQL_GETTODAY = 'SELECT * FROM entries where entry_date = ? ORDER BY id DESC'

function GetCurrentTime(now){
    return now.getHours() + ':' + now.getMinutes();
}

function UpdateCaloriesToday(){
    today_calories = 0;

    let now = new Date();
    db.all(SQL_GETTODAY,[now.toDateString()], (err, data) => {
        if(err) return console.log(err);

        data.forEach(element =>{
            today_calories += parseInt(element['entry_calories']);

        });
    });
}

function UpdateBMR(){
    let weightKG = current_weight * 0.45359237;
    BMR = parseInt(88.362 + (13.397 * weightKG) + (4.799 * height) - (5.677 * age))
}

function UpdateCurrentVars(db){
    db.all(SQL_GETHIGH, (err, data) => {
        if(err) return console.log(err);
        SetCurrentVars(data[0]['id']+1, data[0]['weight']);
    });
}

function SetCurrentVars(new_max, new_weight){
    max_id = new_max;
    current_weight = parseInt(new_weight);
    let ageDifms = Date.now() - birthday;
    let ageDate = new Date(ageDifms);
    age = Math.abs(ageDate.getUTCFullYear() - 1970);
    UpdateBMR();
    UpdateCaloriesToday();
    io.emit('updatedvars')
}

function getDiff(){
    datadict = []
    caldiff = BMR - today_calories;
    datadict['diff'] = Math.abs(caldiff)
    datadict['thresh'] = (caldiff > 0) ? 'under' : 'over'

    return datadict
}

function AddEntry(input){    
    let now = new Date();

    db.run(SQL_INSERT, [max_id, now.toDateString(), GetCurrentTime(now), input['entry-name'], input['entry-calories'], (input['weight'] == '') ? current_weight : input['weight'] ], (err) => {
        if (err) return console.error(err.message)

        max_id++;
    });
}

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/show-form', (req, res) => {
    res.render('pages/newentry');
});

app.get('/show-today', (req, res) => {
    let now = new Date();
    db.all(SQL_GETTODAY,[now.toDateString()], (err, qdata) => {
        if(err) return console.log(err);

        data = {
            entries: qdata,
        }

        res.render('pages/todaytable',data);
    });
});

app.get('/show-stats', (req, res) => {

    const data = {
        bmr: BMR,
        cals: today_calories,
        diff: getDiff(),
    }
    res.render('pages/overview', data);
});

app.post('/submit-entry', (req, res) => {
    let raw = ' ';


    req.on('data', function(data){
        raw += data;
    });

    req.on('end', function() {
        let input = [];
        let splitraw = raw.split('&');

        splitraw.forEach(element => {
            key = element.split('=')[0].trim();
            value = element.split('=')[1].trim();
            input[key] = String(value).replace('%20', ' ');
        });

        AddEntry(input);
        UpdateCurrentVars(db);
        io.emit("submitted");
    });
    
});


server.listen(WEB_PORT, () => {
    console.log('listening on %d', WEB_PORT);
})


io.on('connection', (socket) => {
    console.log("Client Connected");
});

//On start

UpdateCurrentVars(db);

var delayInMilliseconds = 2000; //1 second

setTimeout(function() {
    calorie_diff = BMR - today_calories;
}, delayInMilliseconds);
