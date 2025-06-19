let osmd;
// Biến để lưu nội dung file XML, sẵn sàng để tải về
let musicXmlForDownload = null;

// Gắn sự kiện ngay khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', convertAndDisplay);

    const downloadButton = document.getElementById('downloadButton');
    downloadButton.addEventListener('click', downloadMusicXML);
});

function convertAndDisplay() {
    // Lấy các phần tử DOM
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('fileInfo');
    const osmdCanvas = document.getElementById('osmdCanvas');
    const downloadButton = document.getElementById('downloadButton');

    // Vô hiệu hóa nút tải về và reset nội dung
    downloadButton.disabled = true;
    musicXmlForDownload = null;

    if (!fileInput.files.length) {
        fileInfo.textContent = 'Vui lòng chọn một file MIDI!';
        return;
    }

    const file = fileInput.files[0];
    fileInfo.textContent = `Hành Động Chuyển: ${file.name}`;

    // Khởi tạo OSMD (logic của bạn, không đổi)
    if (!osmd) {
        osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(osmdCanvas, {
            autoResize: true,
            backend: 'svg',
            drawTitle: true,
            drawMeasureNumbers: true,
            drawPartNames: true,
            defaultFontSize: 14,
            pageFormat: 'A4',
            stretchLastSystemLine: true,
            autoBeam: false,
            renderSingleHorizontalStaffline: false
        });
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            // Phần tạo musicXml của bạn (không thay đổi)
            // ... (toàn bộ logic tạo musicXml của bạn được giữ nguyên ở đây)
            const midiData = MidiParser.parse(new Uint8Array(e.target.result));
            const { events, timeSignature } = extractEventsAndTimeSignature(midiData);
            if (!events.length) {
                fileInfo.textContent = 'File MIDI không chứa nốt nhạc!';
                return;
            }
            let musicXml = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd"><score-partwise version="4.0"><work><work-title>Bản Sheet Của Bạn</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">`;
            const beatsPerMeasure = timeSignature.numerator || 4;
            const beatType = timeSignature.denominator || 4;
            const divisions = 480;
            const maxMeasureDuration = (beatsPerMeasure * divisions * 4) / beatType;
            const minRestDuration = 120;
            let currentMeasure = 1;
            let currentMeasureDuration = 0;
            let currentTime = 0;
            let tieId = 0;
            musicXml += `<measure number="${currentMeasure}"><attributes><divisions>${divisions}</divisions><key><fifths>0</fifths></key><time><beats>${beatsPerMeasure}</beats><beat-type>${beatType}</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>`;
            events.sort((a, b) => a.time - b.time).forEach((event, index) => {
                if (event.time > currentTime) {
                    let restDuration = Math.round((event.time - currentTime) * divisions);
                    if (restDuration >= minRestDuration) {
                        while (restDuration > 0) {
                            const remaining = Math.min(restDuration, maxMeasureDuration - currentMeasureDuration);
                            if (remaining >= minRestDuration) {
                                const { type, dot } = durationToTypeAndDot(remaining);
                                musicXml += `<note><rest/><duration>${remaining}</duration><type>${type}</type>${dot ? '<dot/>' : ''}</note>`;
                                currentMeasureDuration += remaining;
                                restDuration -= remaining;
                            }
                            if (restDuration > 0 || currentMeasureDuration >= maxMeasureDuration) {
                                musicXml += `</measure><measure number="${++currentMeasure}">`;
                                currentMeasureDuration = 0;
                            }
                        }
                    }
                }
                if (event.type === 'note') {
                    let duration = Math.round(event.duration * divisions);
                    let noteStartTime = event.time;
                    while (duration > 0) {
                        let remaining = Math.min(duration, maxMeasureDuration - currentMeasureDuration);
                        if (remaining <= 0) remaining = duration;
                        const { type, dot } = durationToTypeAndDot(remaining);
                        const pitch = midiNoteToPitch(event.midi);
                        const isTiedStart = duration > remaining;
                        const isTiedEnd = index > 0 && events[index-1].type === 'note' && events[index-1].time + events[index-1].duration > noteStartTime;
                        const tieAttr = isTiedStart ? ` id="tie${tieId}"` : isTiedEnd ? ` id="tie${tieId-1}"` : '';
                        musicXml += `<note>${event.isChord ? '<chord/>' : ''}<pitch><step>${pitch.step}</step>${pitch.alter ? `<alter>${pitch.alter}</alter>` : ''}<octave>${pitch.octave}</octave></pitch><duration>${remaining}</duration><type>${type}</type>${dot ? '<dot/>' : ''}${isTiedStart ? `<tie type="start"${tieAttr}/><notations><tied type="start"${tieAttr}/></notations>` : ''}${isTiedEnd ? `<tie type="stop"${tieAttr}/><notations><tied type="stop"${tieAttr}/></notations>` : ''}</note>`;
                        currentMeasureDuration += remaining;
                        duration -= remaining;
                        noteStartTime += remaining / divisions;
                        if (isTiedStart) tieId++;
                        if (duration > 0 || currentMeasureDuration >= maxMeasureDuration) {
                            musicXml += `</measure><measure number="${++currentMeasure}">`;
                            currentMeasureDuration = 0;
                        }
                    }
                }
                currentTime = event.time + (event.type === 'note' ? event.duration : 0);
            });
            if (currentMeasureDuration < maxMeasureDuration) {
                const remaining = maxMeasureDuration - currentMeasureDuration;
                if (remaining >= minRestDuration) {
                    const { type, dot } = durationToTypeAndDot(remaining);
                    musicXml += `<note><rest/><duration>${remaining}</duration><type>${type}</type>${dot ? '<dot/>' : ''}</note>`;
                }
            }
            musicXml += `</measure></part></score-partwise>`;
            // --- Kết thúc phần tạo XML của bạn ---

            // Hiển thị MusicXML bằng OSMD
            osmd.load(musicXml).then(() => {
                osmd.render();
                fileInfo.textContent = 'Hoàn Thành!';

                // Lưu nội dung XML để tải về và kích hoạt nút
                musicXmlForDownload = musicXml;
                downloadButton.disabled = false;
            }).catch(err => {
                fileInfo.textContent = 'Lỗi khi hiển thị MusicXML: ' + err.message;
            });

            // Không cần code tạo link <a> cũ nữa

        } catch (error) {
            fileInfo.textContent = 'Lỗi khi xử lý file MIDI: ' + error.message;
        }
    };
    reader.readAsArrayBuffer(file);
}

function downloadMusicXML() {
    if (!musicXmlForDownload) {
        alert("Không có nội dung để tải về. Vui lòng chọn file trước.");
        return;
    }

    const fileInput = document.getElementById('fileInput');
    const originalFileName = fileInput.files[0] ? fileInput.files[0].name : 'output';

    const blob = new Blob([musicXmlForDownload], { type: 'application/vnd.recordare.musicxml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = originalFileName.replace(/\.(mid|midi)$/i, '.musicxml');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Các hàm hỗ trợ của bạn (giữ nguyên không đổi)
function extractEventsAndTimeSignature(midiData) {
    const events = [];
    let timeSignature = { numerator: 4, denominator: 4 };
    let ppq = midiData.timeDivision || 480;
    let activeNotes = {};
    midiData.track.forEach(track => {
        let trackTime = 0;
        track.event.forEach(event => {
            trackTime += event.deltaTime / ppq;
            if (event.type === 0xFF && event.metaType === 0x58) {
                timeSignature = { numerator: event.data[0], denominator: Math.pow(2, event.data[1]) };
            }
            if (event.type === 9 && event.data[1] > 0) {
                const midiNote = event.data[0];
                activeNotes[midiNote] = { startTime: trackTime };
            } else if (event.type === 8 || (event.type === 9 && event.data[1] === 0)) {
                const midiNote = event.data[0];
                if (activeNotes[midiNote]) {
                    const duration = trackTime - activeNotes[midiNote].startTime;
                    events.push({ type: 'note', midi: midiNote, time: activeNotes[midiNote].startTime, duration: duration, isChord: Object.keys(activeNotes).length > 1 });
                    delete activeNotes[midiNote];
                }
            }
        });
    });
    return { events, timeSignature };
}
function midiNoteToPitch(midiNumber) {
    const scale = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
    const accidentals = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
    const noteIndex = midiNumber % 12;
    const octave = Math.floor(midiNumber / 12) - 1;
    const step = scale[noteIndex];
    const alter = accidentals[noteIndex] ? 1 : 0;
    return { step, alter: alter || null, octave };
}
function durationToTypeAndDot(duration) {
    const types = [
        { value: 1920, type: 'whole' }, { value: 960, type: 'half' }, { value: 480, type: 'quarter' },
        { value: 240, type: 'eighth' }, { value: 120, type: '16th' }, { value: 60, type: '32nd' }
    ];
    let closest = types.reduce((prev, curr) => Math.abs(curr.value - duration) < Math.abs(prev.value - duration) ? curr : prev);
    let dot = false;
    if (Math.abs(duration - closest.value * 1.5) < Math.abs(duration - closest.value)) {
        dot = true;
        duration = closest.value * 1.5;
    }
    return { type: closest.type, dot };
}