{
    init: function(elevators, floors) {
        var numFloors = floors.length;
        var numElevators = elevators.length;

        var unclaimedFloors = {
            "-1": new Array(numFloors), // the floors with unclaimed passengers, -1 is going down, 1 is going up
            "1" : new Array(numFloors)
        };
        for (var i = 0; i < numFloors; i++) {
            unclaimedFloors[-1][i] = false;
            unclaimedFloors[1][i] = false;
        }

        function SetupElevator(elevator) {
            elevator.floorPressed = new Array(numFloors);
            for (var i = 0; i < numFloors; i++) {
                elevator.floorPressed[i] = false;
            }

            elevator.currentDir = 0;
        }

        function SetupElevatorDestinations(elevator) {
            var currentFloor = elevator.currentFloor();
            var hasUp = false, hasDown = false;
            for (var i = currentFloor + 1; i < numFloors; ++i) {
                if (elevator.floorPressed[i]) {
                    hasUp = true;
                    break;
                }
            }
            for (var i = 0; i < currentFloor; ++i) {
                if (elevator.floorPressed[i]) {
                    hasDown = true;
                    break;
                }
            }

            function SetupElevatorDirection(elevator, dir) {
                elevator.destinationQueue.length = 0;
                if (dir != 0) {
                    for (var i = elevator.currentFloor() + dir; i >= 0 && i < numFloors; i += dir) {
                        if (elevator.floorPressed[i])
                            elevator.destinationQueue.push(i);
                    }
                }
                elevator.checkDestinationQueue();

                elevator.currentDir = dir;

                elevator.goingUpIndicator(false);
                elevator.goingDownIndicator(false);
                if (dir == 1) {
                    elevator.goingUpIndicator(true);
                }
                else if (dir == -1) {
                    elevator.goingDownIndicator(true);
                }
                else {// dir == 0
                    if (floors[currentFloor].upPressed) { // TODO use randomness to even out up vs down bias?
                        elevator.goingUpIndicator(true);
                    }
                    else if (floors[currentFloor].downPressed) {
                        elevator.goingDownIndicator(true);
                    }
                    else { // just wait for people to board
                        elevator.goingUpIndicator(true);
                        elevator.goingDownIndicator(true);
                    }
                }
            }


            if (elevator.currentDir == 1 && hasUp) {
                SetupElevatorDirection(elevator, 1);
            }
            else if (elevator.currentDir == -1 && hasDown){
                SetupElevatorDirection(elevator, -1);
            }
            else if (hasUp) {
                SetupElevatorDirection(elevator, 1)
            }
            else if (hasDown) {
                SetupElevatorDirection(elevator, -1)
            }
            else {
                SetupElevatorDirection(elevator, 0);
            }
        }

        for (var i = 0; i < numElevators; i++) {
            var elevator = elevators[i];
            (function(elevator) {
                SetupElevator(elevator);

                elevator.on("idle", function() {
                    //elevator.goToFloor((elevator.currentFloor() + 1) % numFloors);
                    
                    elevator.currentDir = 0;
                    elevator.goingUpIndicator(true);
                    elevator.goingDownIndicator(true);

                });

                elevator.on("floor_button_pressed", function(floorNum) {
                    elevator.floorPressed[floorNum] = true;
                    SetupElevatorDestinations(elevator);
                });

                elevator.on("passing_floor", function(floorNum, direction) {
                });

                elevator.on("stopped_at_floor", function(floorNum) {
                    elevator.floorPressed[floorNum] = false;
                    SetupElevatorDestinations(elevator);

                    // people should have boarded according to indicator, so we clear the pressed signals
                    if (floors[floorNum].upPressed && elevator.goingUpIndicator()){
                        floors[floorNum].upPressed = false;
                        unclaimedFloors[1][floorNum] = false;
                    }
                    if (floors[floorNum].downPressed && elevator.goingDownIndicator()) {
                        floors[floorNum].downPressed = false;
                        unclaimedFloors[-1][floorNum] = false;
                    }

                    ClaimUnclaimedFloors();
                });
            })(elevator);
        };

        function ClaimUnclaimedFloors() {
            var sumUnclaimedDowns = 0, sumUnclaimedUps = 0;
            for (var i = 0; i < numFloors; i++) {
                sumUnclaimedUps += unclaimedFloors[1][i] ? 1 : 0;
                sumUnclaimedDowns += unclaimedFloors[-1][i] ? 1 : 0;
            }
            
            var dirsToClaim = [];
            if (sumUnclaimedUps > 0)
                dirsToClaim.push(1);
            if (sumUnclaimedDowns > 0)
                dirsToClaim.push(-1);
            if (dirsToClaim.length == 2 && sumUnclaimedDowns > sumUnclaimedUps)
                dirsToClaim = [-1, 1]; // just flip the order

            for (var i = 0; i < dirsToClaim.length; i++)
                TryToClaimFloorsOnDir(dirsToClaim[i]);
        }

        function TryToClaimFloorsOnDir(dir) { // TODO one issue with claiming mechanism is if another elevator somehow arrived and cleared that floor due to other passenger's request we should really clear the claim
            var foundElevator = null;
            for (var i = 0; i < numElevators; i++) {
                var elevator = elevators[i];
                if (elevator.currentDir == 0) {
                    foundElevator = elevator;
                    break;
                }
            }

            if (foundElevator) { // TODO find the closest one? or use "on the way" too? Or "on the way and last"?
                elevator.currentDir = dir;
                if (dir == 1) {
                    foundElevator.goingUpIndicator(true);
                    foundElevator.goingDownIndicator(false);
                }
                else {
                    foundElevator.goingUpIndicator(false);
                    foundElevator.goingDownIndicator(true);
                }

                var firstFound = true;
                for (var i = (dir == 1 ? 0 : numFloors - 1); i >= 0 && i < numFloors; i += dir) {
                    if (unclaimedFloors[dir][i]) {
                        if (firstFound)
                            elevator.goToFloor(i); // just let the floor stopped event to handle it from there
                        elevator.floorPressed[i] = true;
                        unclaimedFloors[dir][i] = false;
                        
                        firstFound = false;
                    }
                }
            }
        }
        /*
        function TryScheduleElevator(elevator, dir, floorNum) {
            var score = 0;

            var floorDir = floorNum > elevator.currentFloor() ? 1 : (floorNum < elevator.currentFloor() ? -1 : 0);

            if (elevator.currentDir == 0) {
                score = 10; // always schedule idle first. TODO maybe compare with distance? need to worry about other elevators overflowing though
            }
            else if (floorDir == dir && elevator.currentDir == dir) {
                score = 15; // on the way, TODO should this have highest priority?
            }
            else { // TODO add not on the way, BUT last stop
                score = 1;
            }
            return score;
        }
        */
        function CanScheduleElevator(elevator, dir, floorNum) {
            var floorDir = floorNum > elevator.currentFloor() ? 1 : (floorNum < elevator.currentFloor() ? -1 : 0);

            var onTheWay = (floorDir == dir && elevator.currentDir == dir);

            if (elevator.currentDir == 0 || onTheWay)
                return true;
            return false;
        }
        function CompareElevatorsForScheduling(elevator1, elevator2, dir, floorNum) {
            // returns true means elevator2 is better
            var floorDir1 = floorNum > elevator1.currentFloor() ? 1 : (floorNum < elevator1.currentFloor() ? -1 : 0);
            var floorDir2 = floorNum > elevator2.currentFloor() ? 1 : (floorNum < elevator2.currentFloor() ? -1 : 0);

            var onTheWay1 = (floorDir1 == dir && elevator1.currentDir == dir);
            var onTheWay2 = (floorDir2 == dir && elevator2.currentDir == dir);

            if (onTheWay2) {
                if (!onTheWay1)
                    return true;
            }
            else {
                if (elevator2.currentDir == 0) {
                    if (elevator1.currentDir != 0)
                        return true; // try to schedule idle

                    return Math.abs(elevator2.currentFloor() - floorNum) < Math.abs(elevator1.currentFloor() - floorNum);
                }
            }
            return false;
        }

        function ScheduleBestElevator(dir, floorNum) {
            var curScore = 0;
            var curBestElevator = elevators[0];
            for (var i = 1; i < numElevators; i++) { // TODO add some randomness? since we re not accounting for distance etc, random helps mix up which elevator to pick. Can make starting index random plus tie break random
                //var score = TryScheduleElevator(elevators[i], 1, curFloorNum);
                //if (score > curScore) {
                    //curScore = score;
                    //curBestElevator = elevators[i];
                //}
                if (CompareElevatorsForScheduling(curBestElevator, elevators[i], 1, curFloorNum)) {
                    curBestElevator = elevators[i];
                }
            }

            if (CanScheduleElevator(curBestElevator, dir, floorNum)) {
                ScheduleElevator(curBestElevator, dir, floorNum);
            }
            else {
                unclaimedFloors[dir][floorNum] = true;
            }
        }

        function ScheduleElevator(elevator, dir, floorNum) {
            elevator.floorPressed[floorNum] = true;
            SetupElevatorDestinations(elevator); // TODO refactor this. If idle we should go all the way to the top and go down
        }

        for (var curFloorNum = 0; curFloorNum < numFloors; curFloorNum++) {
            (function(curFloorNum) {
                var curFloor = floors[curFloorNum];
                curFloor.on('up_button_pressed', function() {
                    curFloor.upPressed = true; // TODO need to delay the scheduling till later if we can't do it now, since otherwise we're making unncessary stops

                    ScheduleBestElevator(1, curFloorNum);
                });
                curFloor.on('down_button_pressed', function() {
                    curFloor.downPressed = true;

                    ScheduleBestElevator(-1, curFloorNum);
                });
            })(curFloorNum);
        }
    },
    update: function(dt, elevators, floors) {
        // We normally don't need to do anything here
    }
}
