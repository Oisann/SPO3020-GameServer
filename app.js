var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var shortid = require('shortid');

var SERVER_SEED = shortid.generate();
var SERVER_VERSION = '0.0.1';

var SERVER_PORT = process.env.PORT || 3000;
var PREFAB_COUNT = process.env.PREFAB_COUNT || 3;
var LANE_COUNT = process.env.LANE_COUNT || 4;

server.listen(SERVER_PORT);
var startTime = GetUnixTimestamp();

var LOBBIES = [];

app.get('/', function (req, res) {
    res.json({ "seed": SERVER_SEED, "version": SERVER_VERSION, "status": "OK", "online": 0, "uptime": (GetUnixTimestamp() - startTime) });
});

io.on("connection", function (socket) {
    socket.emit('init', { version: SERVER_VERSION, seed: SERVER_SEED, started: startTime });

    socket.on('DUMMY', function (data) {
        //Answer directly
        io.sockets.connected[socket.id].emit('failedLogin', {status: "Error registering the client", error: error});
        //Send to everyone but yourself
        socket.broadcast.emit('registered', { id: "0" });
    });

    socket.on('move', function(data) {
        var lobby = LOBBIES[data.lobbyid];
        if(lobby !== undefined && lobby !== null) {
            var player = lobby.player1.id === socket.id ? lobby.player1 : (lobby.player2.id === socket.id ? lobby.player2 : null);
            var other = lobby.player1.id === socket.id ? lobby.player2 : (lobby.player2.id === socket.id ? lobby.player1 : null);
            if(player != null) {
                var dir = parseInt(data.direction);
                if(dir >= -2 && dir <= 2) {
                    var newPos = player.pos + dir;
                    if(newPos >= 0 && newPos <= (LANE_COUNT - 1)) {
                        player.pos = newPos;
                    } else {
                        console.log('Player tried to move outside the map.');
                    }
                } else {
                    console.log('Player tried to move further than allowed.');
                }
                io.sockets.connected[other.id].emit('moved', { who: player.id === lobby.player1.id ? "0" : "1", pos: player.pos + "" });
                io.sockets.connected[player.id].emit('moved', { who: player.id === lobby.player1.id ? "0" : "1", pos: player.pos + "" });
            } else {
                console.log('Someone tried to move in someone elses lobby...');
            }
        } else {
            console.log('Someone tried to move while not in a lobby...');
        }
    });

    socket.on('matchmake', function (data) {
        var newLobby = {
            timestamp: GetUnixTimestamp(),
            player1: {
                id: socket.id,
                pos: 0
            },
            player2: {
                pos: (LANE_COUNT - 1)
            }
        }

        var pushit = true;
        var lobbyid = shortid.generate();

        for(var lobby in LOBBIES) {
            if(LOBBIES.hasOwnProperty(lobby)) {
                if(LOBBIES[lobby].player1.id !== socket.id && LOBBIES[lobby].player2.id === undefined && LOBBIES[lobby].timestamp < newLobby.timestamp) {
                    pushit = false;
                    lobbyid = lobby;
                    newLobby.player2 = {};
                    newLobby = LOBBIES[lobby];
                    newLobby.player2 = {
                        id: socket.id
                    }
                }
            }
        }

        if(pushit) {
            LOBBIES[lobbyid] = newLobby;
            console.log('In queue');
        } else {
            console.log('match found');

            newLobby.map = GenerateMap(20);

            io.sockets.connected[newLobby.player1.id].emit('matchfound', { lobbyid: lobbyid, playerNumber: "0", map: newLobby.map });
            io.sockets.connected[newLobby.player2.id].emit('matchfound', { lobbyid: lobbyid, playerNumber: "1", map: newLobby.map });
        }
    });
});

function GenerateMap(length) {
    var map = "";
    for(var i = 0; i < length; i++) {
        map += RandomBetween(0, PREFAB_COUNT - 1);
    }
    return map;
}

function RandomBetween(min, max) {
    return Math.floor(Math.random()*(max-min+1)+min);
}

function GetUnixTimestamp() {
    return Math.round(+new Date()/1000);
}