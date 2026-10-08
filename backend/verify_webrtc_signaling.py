import time
import socketio

BASE_URL = 'http://127.0.0.1:5000'

events_log = {
    'john': [],
    'alice': [],
    'bob': []
}

def create_client(name, user_id):
    sio = socketio.Client()

    @sio.on('connect')
    def on_connect():
        events_log[name].append('connected')

    @sio.on('existing-participants')
    def on_existing(data):
        events_log[name].append(('existing-participants', len(data['participants'])))

    @sio.on('user-joined')
    def on_joined(data):
        events_log[name].append(('user-joined', data['user_name']))

    @sio.on('receive-offer')
    def on_offer(data):
        events_log[name].append(('receive-offer', data['from_socket_id']))
        # Simulate answering
        sio.emit('signal-answer', {
            'to_socket_id': data['from_socket_id'],
            'answer': {'type': 'answer', 'sdp': 'mock_sdp_answer'}
        })

    @sio.on('receive-answer')
    def on_answer(data):
        events_log[name].append(('receive-answer', data['from_socket_id']))

    @sio.on('receive-ice-candidate')
    def on_ice(data):
        events_log[name].append(('receive-ice-candidate', data['from_socket_id']))

    @sio.on('user-left')
    def on_left(data):
        events_log[name].append(('user-left', data['socket_id']))

    sio.connect(BASE_URL)
    return sio

def run_mesh_test():
    print(">> Step 1: Connecting John (Leader / Host)...")
    sio_john = create_client('john', 1)
    sio_john.emit('join-room', {'meeting_id': 'MTG001', 'user_id': 1, 'user_name': 'John Leader'})
    time.sleep(0.5)

    print(">> Step 2: Connecting Alice (Peer 2)...")
    sio_alice = create_client('alice', 2)
    sio_alice.emit('join-room', {'meeting_id': 'MTG001', 'user_id': 2, 'user_name': 'Alice Member'})
    time.sleep(0.5)

    # Alice sends offer to John (from existing-participants)
    sio_alice.emit('signal-offer', {
        'to_socket_id': sio_john.sid,
        'offer': {'type': 'offer', 'sdp': 'mock_sdp_offer_alice_to_john'},
        'user_id': 2,
        'user_name': 'Alice Member'
    })
    time.sleep(0.5)

    print(">> Step 3: Connecting Bob (Peer 3 - Full Mesh)...")
    sio_bob = create_client('bob', 3)
    sio_bob.emit('join-room', {'meeting_id': 'MTG001', 'user_id': 3, 'user_name': 'Bob Engineer'})
    time.sleep(0.5)

    # Bob sends offers to BOTH John and Alice (Full Mesh)
    sio_bob.emit('signal-offer', {
        'to_socket_id': sio_john.sid,
        'offer': {'type': 'offer', 'sdp': 'mock_offer_bob_to_john'},
        'user_id': 3,
        'user_name': 'Bob Engineer'
    })
    sio_bob.emit('signal-offer', {
        'to_socket_id': sio_alice.sid,
        'offer': {'type': 'offer', 'sdp': 'mock_offer_bob_to_alice'},
        'user_id': 3,
        'user_name': 'Bob Engineer'
    })
    time.sleep(0.5)

    # Alice exchanges ICE candidate with Bob
    sio_alice.emit('signal-ice-candidate', {
        'to_socket_id': sio_bob.sid,
        'candidate': {'candidate': 'candidate:1 1 UDP 2130706431 192.168.1.1 50005 typ host'}
    })
    time.sleep(0.5)

    # Bob leaves room
    print(">> Step 4: Bob leaves room...")
    sio_bob.emit('leave-room', {'meeting_id': 'MTG001', 'user_id': 3})
    time.sleep(0.5)

    sio_john.disconnect()
    sio_alice.disconnect()
    sio_bob.disconnect()

    print("\n>> VERIFICATION RESULTS:")
    print("John Events:", events_log['john'])
    print("Alice Events:", events_log['alice'])
    print("Bob Events:", events_log['bob'])

if __name__ == '__main__':
    run_mesh_test()
