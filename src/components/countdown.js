import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function App() {
    const [isAppReady, setIsAppReady] = useState(false);

    // Monitoring State
    const [isMonitoring, setIsMonitoring] = useState(false);
    const [initialSpace, setInitialSpace] = useState(null);

    // Queue State
    const [timerQueue, setTimerQueue] = useState([]);
    const [activeTimeLeft, setActiveTimeLeft] = useState(0);

    // 1. WAKE UP LOGIC
    useEffect(() => {
        const loadState = async () => {
            try {
                const savedIsMonitoring = await AsyncStorage.getItem('isMonitoring');
                if (savedIsMonitoring === 'true') {
                    const savedSpace = await AsyncStorage.getItem('initialSpace');
                    if (savedSpace) {
                        setInitialSpace(parseFloat(savedSpace));
                        setIsMonitoring(true);
                    }
                }

                const savedQueue = await AsyncStorage.getItem('timerQueue');
                if (savedQueue) {
                    const parsedQueue = JSON.parse(savedQueue);
                    const now = Date.now();

                    // Time Travel: Only delete timers at the front of the line if they were actively running AND finished
                    let validQueue = [...parsedQueue];
                    while (validQueue.length > 0 && validQueue[0].endTime !== null && validQueue[0].endTime <= now) {
                        validQueue.shift();
                    }

                    setTimerQueue(validQueue);
                    if (validQueue.length !== parsedQueue.length) {
                        await AsyncStorage.setItem('timerQueue', JSON.stringify(validQueue));
                    }
                }
            } catch (e) {
                console.error("Failed to load state", e);
            } finally {
                setIsAppReady(true);
            }
        };
        loadState();
    }, []);

    // 2. TICK LOGIC
    useEffect(() => {
        let interval;

        if (timerQueue.length > 0) {
            const currentTimer = timerQueue[0];

            // Check if the timer has actually been given permission to run
            if (currentTimer.endTime !== null) {
                interval = setInterval(() => {
                    const now = Date.now();
                    const timeLeft = Math.floor((currentTimer.endTime - now) / 1000);

                    if (timeLeft <= 0) {
                        // Timer Finished! Slide the queue forward.
                        setTimerQueue(prevQueue => {
                            const newQueue = [...prevQueue];
                            newQueue.shift();
                            AsyncStorage.setItem('timerQueue', JSON.stringify(newQueue));
                            return newQueue;
                        });
                        alert(`Dustor Finished a chunk! Cleared ${currentTimer.mb} MB.`);
                    } else {
                        setActiveTimeLeft(timeLeft);
                    }
                }, 1000);
            } else {
                // Timer is waiting for the user to press start! Just show the starting time.
                setActiveTimeLeft(currentTimer.totalSeconds);
            }
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [timerQueue]);

    // 3. START MONITORING
    const startMonitoring = async () => {
        const freeSpace = await FileSystem.getFreeDiskStorageAsync();
        setInitialSpace(freeSpace);
        setIsMonitoring(true);
        await AsyncStorage.setItem('initialSpace', freeSpace.toString());
        await AsyncStorage.setItem('isMonitoring', 'true');
    };

    // 4. STOP MONITORING & ADD TO QUEUE (PAUSED)
    const stopMonitoring = async () => {
        const currentFreeSpace = await FileSystem.getFreeDiskStorageAsync();

        if (initialSpace !== null) {
            const bytesFreed = currentFreeSpace - initialSpace;
            let mbFreed = bytesFreed / (1024 * 1024);
            if (mbFreed < 1) mbFreed = 1; // TEST OVERRIDE: Still forces at least 1 min

            const minutes = Math.floor(mbFreed);
            const totalSeconds = minutes * 60;

            // Create the new Timer Object, but endTime is NULL so it waits
            const newTimer = {
                id: Date.now().toString(),
                totalSeconds: totalSeconds,
                endTime: null,
                mins: minutes,
                mb: parseFloat(mbFreed.toFixed(2))
            };

            const newQueue = [...timerQueue, newTimer];
            setTimerQueue(newQueue);
            setIsMonitoring(false);

            await AsyncStorage.setItem('timerQueue', JSON.stringify(newQueue));
            await AsyncStorage.multiRemove(['initialSpace', 'isMonitoring']);
        }
    };

    // 5. NEW: MANUAL START BUTTON LOGIC
    const startActiveTimer = async () => {
        if (timerQueue.length === 0) return;

        const newQueue = [...timerQueue];
        // Calculate the real-world end time exactly when the button is pressed
        newQueue[0].endTime = Date.now() + (newQueue[0].totalSeconds * 1000);

        setTimerQueue(newQueue);
        await AsyncStorage.setItem('timerQueue', JSON.stringify(newQueue));
    };

    // Helper
    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    if (!isAppReady) {
        return <View style={styles.container}><ActivityIndicator size="large" color="#2ecc71" /></View>;
    }

    return (
        <ScrollView contentContainerStyle={styles.scrollContainer}>
            <Text style={styles.title}>Dustor Timer</Text>

            {/* --- TOP BOX: THE ACTIVE TIMER --- */}
            {timerQueue.length > 0 ? (
                <View style={styles.box}>
                    <Text style={styles.statusText}>
                        {timerQueue[0].endTime !== null ? "Active Mission" : "Mission Ready"}
                    </Text>
                    <Text style={styles.subText}>Clearing {timerQueue[0].mb} MB</Text>
                    <Text style={styles.timer}>{formatTime(activeTimeLeft)}</Text>

                    {/* NEW: Only show the "Start Timer?" button if it hasn't started yet */}
                    {timerQueue[0].endTime === null && (
                        <View style={{ marginBottom: 15 }}>
                            <Button title="Start Timer?" onPress={startActiveTimer} color="#2ecc71" />
                        </View>
                    )}

                    {/* Up Next List */}
                    {timerQueue.length > 1 && (
                        <View style={styles.queueContainer}>
                            <Text style={styles.queueTitle}>Up Next in Queue:</Text>
                            {timerQueue.slice(1).map((t, index) => (
                                <Text key={t.id} style={styles.queuedItem}>
                                    ⏳ #{index + 1}: {t.mins} mins (for {t.mb} MB)
                                </Text>
                            ))}
                        </View>
                    )}
                </View>
            ) : (
                <View style={styles.box}>
                    <Text style={styles.statusText}>Planet is waiting to be cleaned...</Text>
                    <Text style={styles.subText}>Ready for a new mission?</Text>
                </View>
            )}

            {/* --- BOTTOM BOX: ACTION BUTTONS --- */}
            <View style={styles.actionBox}>
                {!isMonitoring ? (
                    <Button
                        title={timerQueue.length > 0 ? "+ Queue Another Mission" : "Start New Mission"}
                        onPress={startMonitoring}
                        color="#3498db"
                    />
                ) : (
                    <View style={{ alignItems: 'center' }}>
                        <Text style={styles.statusText}>🧹 Monitoring Storage...</Text>
                        <Text style={styles.subText}>Go delete things, then return!</Text>
                        <View style={{ marginTop: 10 }}>
                            <Button title="Calculate & Add to Queue" onPress={stopMonitoring} color="#e74c3c" />
                        </View>
                    </View>
                )}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa' },
    scrollContainer: { flexGrow: 1, alignItems: 'center', backgroundColor: '#f8f9fa', padding: 20, paddingTop: 80 },
    title: { fontSize: 36, fontWeight: '900', marginBottom: 20, color: '#2c3e50', textAlign: 'center' },
    box: { alignItems: 'center', backgroundColor: '#ffffff', padding: 30, borderRadius: 15, elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, width: '100%', marginBottom: 20 },
    actionBox: { alignItems: 'center', backgroundColor: '#ffffff', padding: 20, borderRadius: 15, elevation: 2, width: '100%' },
    statusText: { fontSize: 22, fontWeight: 'bold', color: '#e67e22', marginBottom: 5, textAlign: 'center' },
    subText: { fontSize: 16, color: '#7f8c8d', marginBottom: 5, textAlign: 'center' },
    timer: { fontSize: 72, fontWeight: 'bold', color: '#2ecc71', marginVertical: 10 },
    queueContainer: { marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderColor: '#eee', width: '100%', alignItems: 'center' },
    queueTitle: { fontSize: 18, fontWeight: 'bold', color: '#34495e', marginBottom: 10 },
    queuedItem: { fontSize: 16, color: '#7f8c8d', marginVertical: 3 }
});