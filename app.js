var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var shortid = require('shortid');

var SERVER_SEED = shortid.generate();
var SERVER_VERSION = '0.0.1';
var SERVER_PORT = process.env.PORT || 3000;
server.listen(SERVER_PORT);
var startTime = GetUnixTimestamp();

app.get('/', function (req, res) {
    res.json({ "seed": SERVER_SEED, "version": SERVER_VERSION, "status": "OK", "online": 0, "uptime": (GetUnixTimestamp() - startTime) });
});

io.on("connection", function (socket) {
    socket.emit('init', { version: SERVER_VERSION, seed: SERVER_SEED });

    socket.on('register', function (data) {
        //Answer directly
        io.sockets.connected[socket.id].emit('failedLogin', {status: "Error registering the client", error: error});
        //Send to everyone but yourself
        socket.broadcast.emit('registered', { id: "0" });
    });

});

function GetUnixTimestamp() {
    return Math.round(+new Date()/1000);
}