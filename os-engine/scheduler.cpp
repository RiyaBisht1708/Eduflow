// EduFlow OS engine - CPU scheduling simulator
//
// Usage:
//   ./scheduler <algo> [quantum] [--json] < jobs.txt
//     algo    : fcfs | priority | rr | all
//     quantum : time quantum for Round Robin (default 2)
//     --json  : machine-readable output (used by the Spring Boot backend)
//
// Input, one job per line:  id,name,arrival,burst,priority
// Priority convention: LOWER number = HIGHER priority (1 is most urgent).
// Priority scheduling here is non-preemptive.

#include <algorithm>
#include <cstdint>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <queue>
#include <sstream>
#include <string>
#include <vector>
using namespace std;

struct Job {
    int id; string name; int arrival, burst, priority;
    int start = -1, completion = 0;        // start = first time on CPU
    int remaining = 0;
    int turnaround() const { return completion - arrival; }
    int waiting()    const { return turnaround() - burst; }
    int response()   const { return start - arrival; }
};
struct Slice { int jobId; int from, to; };   // jobId -1 == CPU idle

struct Result {
    string algo; vector<Job> jobs; vector<Slice> gantt;
    double avgWT = 0, avgTAT = 0, avgRT = 0;
};

static void addSlice(vector<Slice>& g, int id, int from, int to) {
    if (from == to) return;
    if (!g.empty() && g.back().jobId == id && g.back().to == from) g.back().to = to;
    else g.push_back({id, from, to});
}

static void finish(Result& r) {
    for (auto& j : r.jobs) { r.avgWT += j.waiting(); r.avgTAT += j.turnaround(); r.avgRT += j.response(); }
    double n = r.jobs.size();
    if (n > 0) { r.avgWT /= n; r.avgTAT /= n; r.avgRT /= n; }
}

// Shared by FCFS and Priority: non-preemptive, picks the next job with `better`.
template <class Better>
static Result nonPreemptive(const string& name, vector<Job> jobs, Better better) {
    Result r; r.algo = name;
    int t = 0, done = 0, n = jobs.size();
    vector<bool> finished(n, false);
    while (done < n) {
        int pick = -1;
        for (int i = 0; i < n; i++) {
            if (finished[i] || jobs[i].arrival > t) continue;
            if (pick == -1 || better(jobs[i], jobs[pick])) pick = i;
        }
        if (pick == -1) {                       // CPU idle until next arrival
            int next = INT32_MAX;
            for (int i = 0; i < n; i++) if (!finished[i]) next = min(next, jobs[i].arrival);
            addSlice(r.gantt, -1, t, next); t = next; continue;
        }
        Job& j = jobs[pick];
        j.start = t; addSlice(r.gantt, j.id, t, t + j.burst);
        t += j.burst; j.completion = t; finished[pick] = true; done++;
    }
    r.jobs = jobs; finish(r); return r;
}

static Result fcfs(vector<Job> jobs) {
    return nonPreemptive("FCFS", jobs, [](const Job& a, const Job& b) {
        return a.arrival != b.arrival ? a.arrival < b.arrival : a.id < b.id; });
}

static Result priorityNP(vector<Job> jobs) {
    return nonPreemptive("Priority", jobs, [](const Job& a, const Job& b) {
        if (a.priority != b.priority) return a.priority < b.priority;
        if (a.arrival  != b.arrival)  return a.arrival  < b.arrival;   // tie-break: FCFS
        return a.id < b.id; });
}

static Result roundRobin(vector<Job> jobs, int q) {
    Result r; r.algo = "Round Robin (q=" + to_string(q) + ")";
    int n = jobs.size(), t = 0, done = 0, next = 0;
    for (auto& j : jobs) j.remaining = j.burst;
    vector<int> order(n); for (int i = 0; i < n; i++) order[i] = i;
    sort(order.begin(), order.end(), [&](int a, int b) {
        return jobs[a].arrival != jobs[b].arrival ? jobs[a].arrival < jobs[b].arrival : jobs[a].id < jobs[b].id; });
    queue<int> ready;
    auto admit = [&](int upto) {
        while (next < n && jobs[order[next]].arrival <= upto) ready.push(order[next++]); };
    admit(t);
    while (done < n) {
        if (ready.empty()) {                    // idle gap
            int at = jobs[order[next]].arrival;
            addSlice(r.gantt, -1, t, at); t = at; admit(t); continue;
        }
        int i = ready.front(); ready.pop();
        Job& j = jobs[i];
        if (j.start == -1) j.start = t;
        int run = min(q, j.remaining);
        addSlice(r.gantt, j.id, t, t + run);
        t += run; j.remaining -= run;
        admit(t);                               // arrivals during the slice enter before the preempted job
        if (j.remaining > 0) ready.push(i);
        else { j.completion = t; done++; }
    }
    r.jobs = jobs; finish(r); return r;
}

// ---------- output ----------
static void printText(const Result& r) {
    cout << "\n=== " << r.algo << " ===\n";
    cout << left << setw(6) << "ID" << setw(16) << "Job" << setw(6) << "AT" << setw(6) << "BT"
         << setw(6) << "PR" << setw(6) << "CT" << setw(6) << "TAT" << setw(6) << "WT" << "RT\n";
    for (auto& j : r.jobs)
        cout << left << setw(6) << j.id << setw(16) << j.name << setw(6) << j.arrival << setw(6) << j.burst
             << setw(6) << j.priority << setw(6) << j.completion << setw(6) << j.turnaround()
             << setw(6) << j.waiting() << j.response() << "\n";
    cout << fixed << setprecision(2)
         << "Avg waiting: " << r.avgWT << "   Avg turnaround: " << r.avgTAT << "   Avg response: " << r.avgRT << "\n";
    cout << "Gantt: ";
    for (auto& s : r.gantt) cout << "| " << (s.jobId < 0 ? string("idle") : "J" + to_string(s.jobId)) << " ";
    cout << "|\n       ";
    if (!r.gantt.empty()) cout << r.gantt.front().from;
    for (auto& s : r.gantt) cout << "    " << s.to;
    cout << "\n";
}

static string esc(const string& s) {
    string o; for (char c : s) { if (c == '"' || c == '\\') o += '\\'; o += c; } return o; }

static void printJson(const vector<Result>& rs) {
    cout << fixed << setprecision(2) << "{\"results\":[";
    for (size_t k = 0; k < rs.size(); k++) {
        const Result& r = rs[k];
        if (k) cout << ",";
        cout << "{\"algorithm\":\"" << esc(r.algo) << "\",\"avgWaiting\":" << r.avgWT
             << ",\"avgTurnaround\":" << r.avgTAT << ",\"avgResponse\":" << r.avgRT << ",\"jobs\":[";
        for (size_t i = 0; i < r.jobs.size(); i++) {
            const Job& j = r.jobs[i]; if (i) cout << ",";
            cout << "{\"id\":" << j.id << ",\"name\":\"" << esc(j.name) << "\",\"arrival\":" << j.arrival
                 << ",\"burst\":" << j.burst << ",\"priority\":" << j.priority << ",\"completion\":" << j.completion
                 << ",\"turnaround\":" << j.turnaround() << ",\"waiting\":" << j.waiting()
                 << ",\"response\":" << j.response() << "}";
        }
        cout << "],\"gantt\":[";
        for (size_t i = 0; i < r.gantt.size(); i++) {
            if (i) cout << ",";
            cout << "{\"job\":" << r.gantt[i].jobId << ",\"from\":" << r.gantt[i].from << ",\"to\":" << r.gantt[i].to << "}";
        }
        cout << "]}";
    }
    cout << "]}\n";
}

int main(int argc, char** argv) {
    string algo = argc > 1 ? argv[1] : "all";
    int quantum = 2; bool json = false;
    for (int i = 2; i < argc; i++) {
        string a = argv[i];
        if (a == "--json") json = true;
        else quantum = max(1, atoi(a.c_str()));
    }
    vector<Job> jobs; string line;
    while (getline(cin, line)) {
        if (line.empty() || line[0] == '#') continue;
        stringstream ss(line); string f[5]; int k = 0;
        while (k < 5 && getline(ss, f[k], ',')) k++;
        if (k < 5) { cerr << "bad line: " << line << "\n"; return 1; }
        Job j; j.id = stoi(f[0]); j.name = f[1]; j.arrival = stoi(f[2]); j.burst = stoi(f[3]); j.priority = stoi(f[4]);
        if (j.burst <= 0 || j.arrival < 0) { cerr << "invalid burst/arrival: " << line << "\n"; return 1; }
        jobs.push_back(j);
    }
    if (jobs.empty()) { cerr << "no jobs on stdin\n"; return 1; }

    vector<Result> out;
    if (algo == "priority" || algo == "all") out.push_back(priorityNP(jobs));
    if (algo == "fcfs"     || algo == "all") out.push_back(fcfs(jobs));
    if (algo == "rr"       || algo == "all") out.push_back(roundRobin(jobs, quantum));
    if (out.empty()) { cerr << "unknown algorithm: " << algo << "\n"; return 1; }

    if (json) printJson(out); else for (auto& r : out) printText(r);
    return 0;
}
