// MedicinaEcuador Pro - OrbitControls Fix
THREE.OrbitControls = function ( object, domElement ) {
    this.object = object;
    this.domElement = domElement;
    this.enabled = true;
    this.target = new THREE.Vector3();
    this.minDistance = 0;
    this.maxDistance = Infinity;
    this.minZoom = 0;
    this.maxZoom = Infinity;
    this.minPolarAngle = 0;
    this.maxPolarAngle = Math.PI;
    this.minAzimuthAngle = - Infinity;
    this.maxAzimuthAngle = Infinity;
    this.enableDamping = false;
    this.dampingFactor = 0.05;
    this.enableZoom = true;
    this.zoomSpeed = 1.0;
    this.enableRotate = true;
    this.rotateSpeed = 1.0;
    this.enablePan = true;
    this.panSpeed = 1.0;
    this.screenSpacePanning = true;
    this.keyPanSpeed = 7.0;
    this.autoRotate = false;
    this.autoRotateSpeed = 2.0;
    this.enableKeys = true;
    this.keys = { LEFT: 37, UP: 38, RIGHT: 39, BOTTOM: 40 };
    this.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    var scope = this;
    var changeEvent = { type: 'change' };
    var startEvent = { type: 'start' };
    var endEvent = { type: 'end' };
    var EPS = 0.000001;
    var lastPosition = new THREE.Vector3();
    var lastQuaternion = new THREE.Quaternion();

    var spherical = new THREE.Spherical();
    var sphericalDelta = new THREE.Spherical();
    var scale = 1;
    var panOffset = new THREE.Vector3();
    var zoomChanged = false;

    this.update = function () {
        var offset = new THREE.Vector3();
        var quat = new THREE.Quaternion().setFromUnitVectors( object.up, new THREE.Vector3( 0, 1, 0 ) );
        var quatInverse = quat.clone().invert();
        var position = object.position;
        offset.copy( position ).sub( scope.target );
        offset.applyQuaternion( quat );
        spherical.setFromVector3( offset );

        if ( scope.autoRotate && scope.enableRotate ) {
            scope.rotateLeft( ( 2 * Math.PI / 60 / 60 ) * scope.autoRotateSpeed );
        }

        spherical.theta += sphericalDelta.theta;
        spherical.phi += sphericalDelta.phi;
        spherical.theta = Math.max( scope.minAzimuthAngle, Math.min( scope.maxAzimuthAngle, spherical.theta ) );
        spherical.phi = Math.max( scope.minPolarAngle, Math.min( scope.maxPolarAngle, spherical.phi ) );
        spherical.makeSafe();
        spherical.radius *= scale;
        spherical.radius = Math.max( scope.minDistance, Math.min( scope.maxDistance, spherical.radius ) );

        scope.target.add( panOffset );
        offset.setFromSpherical( spherical );
        offset.applyQuaternion( quatInverse );
        position.copy( scope.target ).add( offset );
        object.lookAt( scope.target );

        if ( scope.enableDamping === true ) {
            sphericalDelta.theta *= ( 1 - scope.dampingFactor );
            sphericalDelta.phi *= ( 1 - scope.dampingFactor );
            panOffset.multiplyScalar( 1 - scope.dampingFactor );
        } else {
            sphericalDelta.set( 0, 0, 0 );
            panOffset.set( 0, 0, 0 );
        }

        scale = 1;

        if ( lastPosition.distanceToSquared( object.position ) > EPS || 8 * ( 1 - lastQuaternion.dot( object.quaternion ) ) > EPS ) {
            scope.dispatchEvent( changeEvent );
            lastPosition.copy( object.position );
            lastQuaternion.copy( object.quaternion );
            return true;
        }
        return false;
    };

    this.rotateLeft = function ( angle ) { sphericalDelta.theta -= angle; };
    this.rotateUp = function ( angle ) { sphericalDelta.phi -= angle; };

    function onMouseDown( event ) {
        if ( scope.enabled === false ) return;
        event.preventDefault();
        document.addEventListener( 'mousemove', onMouseMove, false );
        document.addEventListener( 'mouseup', onMouseUp, false );
        scope.dispatchEvent( startEvent );
    }

    function onMouseMove( event ) {
        if ( scope.enabled === false ) return;
        // Movimiento básico de rotación
        var element = scope.domElement;
        sphericalDelta.theta -= 2 * Math.PI * event.movementX / element.clientHeight;
        sphericalDelta.phi -= 2 * Math.PI * event.movementY / element.clientHeight;
        scope.update();
    }

    function onMouseUp() {
        document.removeEventListener( 'mousemove', onMouseMove, false );
        document.removeEventListener( 'mouseup', onMouseUp, false );
        scope.dispatchEvent( endEvent );
    }

    this.domElement.addEventListener( 'mousedown', onMouseDown, false );
    this.update();
};

THREE.OrbitControls.prototype = Object.create( THREE.EventDispatcher.prototype );
THREE.OrbitControls.prototype.constructor = THREE.OrbitControls;
window.OrbitControls = THREE.OrbitControls;