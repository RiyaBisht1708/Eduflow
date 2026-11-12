CXX      = g++
CXXFLAGS = -std=c++17 -O2 -Wall -Wextra -pthread

all: scheduler sync_demo

scheduler: scheduler.cpp
	$(CXX) $(CXXFLAGS) -o $@ $<

sync_demo: sync_demo.cpp
	$(CXX) $(CXXFLAGS) -o $@ $<

clean:
	rm -f scheduler sync_demo
