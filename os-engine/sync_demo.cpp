// EduFlow OS engine - synchronization & process demos
//
//   ./sync_demo race        seat allocation WITHOUT and WITH a mutex
//   ./sync_demo prodcons    bounded-buffer Producer-Consumer (mutex + condition variables)
//   ./sync_demo deadlock    deadlock simulation (circular wait) and its fix (lock ordering)
//   ./sync_demo process     process management with fork()/wait()
//   ./sync_demo all

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <queue>
#include <string>
#include <thread>
#include <vector>
#include <sys/wait.h>
#include <unistd.h>
using namespace std;
using namespace chrono_literals;

// ---------------------------------------------------------------------------
// 1. Race condition: many admission officers allocate the last seats at once.
// ---------------------------------------------------------------------------
// The "unsafe" version deliberately uses a non-atomic check-then-act with a
// small sleep inside the critical section, so the race is visible every run.
static int seatsLeftUnsafe, allocatedUnsafe;
static int seatsLeftSafe,   allocatedSafe;
static mutex seatMutex;

static void unsafeAllocate() {
    if (seatsLeftUnsafe > 0) {                 // check
        this_thread::sleep_for(1ms);           // another thread can pass the check here
        seatsLeftUnsafe--; allocatedUnsafe++;  // act
    }
}
static void safeAllocate() {
    lock_guard<mutex> lock(seatMutex);         // critical section
    if (seatsLeftSafe > 0) { seatsLeftSafe--; allocatedSafe++; }
}

static void raceDemo() {
    const int SEATS = 5, THREADS = 20;
    cout << "\n--- Race condition: " << THREADS << " threads, " << SEATS << " seats ---\n";

    seatsLeftUnsafe = SEATS; allocatedUnsafe = 0;
    { vector<thread> ts; for (int i = 0; i < THREADS; i++) ts.emplace_back(unsafeAllocate); for (auto& t : ts) t.join(); }
    cout << "Without mutex: allocated " << allocatedUnsafe << " seats (capacity " << SEATS << ")"
         << (allocatedUnsafe > SEATS ? "  <-- OVERBOOKED, race condition!" : "") << "\n";

    seatsLeftSafe = SEATS; allocatedSafe = 0;
    { vector<thread> ts; for (int i = 0; i < THREADS; i++) ts.emplace_back(safeAllocate); for (auto& t : ts) t.join(); }
    cout << "With mutex   : allocated " << allocatedSafe << " seats (capacity " << SEATS << ")  <-- correct\n";
}

// ---------------------------------------------------------------------------
// 2. Producer-Consumer: API threads produce jobs, worker threads consume them.
// ---------------------------------------------------------------------------
static void prodConsDemo() {
    cout << "\n--- Producer-Consumer (bounded buffer, capacity 3) ---\n";
    queue<int> buffer; const size_t CAP = 3;
    mutex m; condition_variable notFull, notEmpty; mutex out;
    const int PRODUCERS = 2, CONSUMERS = 2, PER_PRODUCER = 5;
    atomic<int> consumed{0};

    auto say = [&](const string& s) { lock_guard<mutex> l(out); cout << s << "\n"; };

    auto producer = [&](int pid) {
        for (int i = 0; i < PER_PRODUCER; i++) {
            int job = pid * 100 + i;
            unique_lock<mutex> lk(m);
            notFull.wait(lk, [&] { return buffer.size() < CAP; });   // wait if buffer full
            buffer.push(job); lk.unlock();
            say("  producer " + to_string(pid) + " queued job " + to_string(job));
            notEmpty.notify_one();
            this_thread::sleep_for(2ms);
        }
    };
    auto consumer = [&](int cid) {
        while (true) {
            unique_lock<mutex> lk(m);
            notEmpty.wait(lk, [&] { return !buffer.empty() || consumed >= PRODUCERS * PER_PRODUCER; });
            if (buffer.empty()) return;                              // all work done
            int job = buffer.front(); buffer.pop(); consumed++; lk.unlock();
            notFull.notify_one(); notEmpty.notify_all();
            say("      worker " + to_string(cid) + " processed job " + to_string(job));
            this_thread::sleep_for(3ms);
        }
    };

    vector<thread> ts;
    for (int i = 0; i < PRODUCERS; i++) ts.emplace_back(producer, i + 1);
    for (int i = 0; i < CONSUMERS; i++) ts.emplace_back(consumer, i + 1);
    for (auto& t : ts) t.join();
    cout << "  total processed: " << consumed << " / " << PRODUCERS * PER_PRODUCER << "\n";
}

// ---------------------------------------------------------------------------
// 3. Deadlock: two tasks need both the Seat lock and the Payment lock.
// ---------------------------------------------------------------------------
static void deadlockDemo() {
    cout << "\n--- Deadlock simulation (circular wait) ---\n";
    timed_mutex seatLock, paymentLock;
    atomic<int> stuck{0};

    // Task A: Seat -> Payment.  Task B: Payment -> Seat.  Timed locks let us *detect*
    // the deadlock instead of hanging the demo forever.
    auto task = [&](const char* name, timed_mutex& first, timed_mutex& second) {
        unique_lock<timed_mutex> a(first);
        this_thread::sleep_for(50ms);                    // both tasks now hold one lock each
        if (!second.try_lock_for(300ms)) {
            cout << "  " << name << ": waited 300ms for second lock -> DEADLOCK detected\n";
            stuck++;
            return;                                      // releasing `first` breaks the deadlock
        }
        second.unlock();
        cout << "  " << name << ": got both locks\n";
    };
    { thread a(task, "Task A (seat->payment)", ref(seatLock),    ref(paymentLock));
      thread b(task, "Task B (payment->seat)", ref(paymentLock), ref(seatLock));
      a.join(); b.join(); }
    cout << "  tasks stuck: " << stuck << " (circular wait; the other task finished once the stuck one backed off and released its lock)\n";

    cout << "  Fix: acquire locks in a fixed global order (Seat, then Payment)\n";
    auto ordered = [&](const char* name) {
        lock_guard<timed_mutex> a(seatLock);
        this_thread::sleep_for(50ms);
        lock_guard<timed_mutex> b(paymentLock);
        cout << "  " << name << ": got both locks, no deadlock\n";
    };
    { thread a(ordered, "Task A"); thread b(ordered, "Task B"); a.join(); b.join(); }
}

// ---------------------------------------------------------------------------
// 4. Process management: one child process per admission job.
// ---------------------------------------------------------------------------
static void processDemo() {
    cout << "\n--- Process management (fork / wait) ---\n";
    const char* jobs[] = {"DOC_VERIFY", "ELIGIBILITY", "PAYMENT_VERIFY"};
    cout << "  parent pid " << getpid() << " spawning " << 3 << " worker processes\n" << flush;
    for (int i = 0; i < 3; i++) {
        pid_t pid = fork();
        if (pid == 0) {                                  // child
            usleep(20000 * (i + 1));
            cout << "  child pid " << getpid() << " finished " << jobs[i] << "\n" << flush;
            _exit(i);
        }
    }
    int status; pid_t p;
    while ((p = wait(&status)) > 0)
        cout << "  parent reaped pid " << p << " (exit code " << WEXITSTATUS(status) << ")\n";
}

int main(int argc, char** argv) {
    string what = argc > 1 ? argv[1] : "all";
    if (what == "race"     || what == "all") raceDemo();
    if (what == "prodcons" || what == "all") prodConsDemo();
    if (what == "deadlock" || what == "all") deadlockDemo();
    if (what == "process"  || what == "all") processDemo();
    if (what != "race" && what != "prodcons" && what != "deadlock" && what != "process" && what != "all") {
        cerr << "usage: sync_demo race|prodcons|deadlock|process|all\n"; return 1;
    }
    return 0;
}
