import sqlite3
import json
import multiprocessing
import time
import traceback
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / "jobs.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS jobs (
            job_id TEXT PRIMARY KEY,
            status TEXT,
            message TEXT,
            percent INTEGER,
            mode TEXT,
            created TEXT,
            result TEXT,
            trace TEXT
        )
    ''')
    conn.commit()
    conn.close()

def get_job(job_id):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute('SELECT * FROM jobs WHERE job_id = ?', (job_id,))
    row = c.fetchone()
    conn.close()
    if row:
        job = dict(row)
        if job['result']:
            try:
                job['result'] = json.loads(job['result'])
            except json.JSONDecodeError:
                pass
        return job
    return None

def update_job(job_id, **kwargs):
    conn = sqlite3.connect(DB_PATH, timeout=10)
    c = conn.cursor()
    for key, value in kwargs.items():
        if key == 'result' and isinstance(value, dict):
            value = json.dumps(value)
        c.execute(f'UPDATE jobs SET {key} = ? WHERE job_id = ?', (value, job_id))
    conn.commit()
    conn.close()

def create_job(job_id, status="queued", message="", percent=0, mode="", result=None):
    conn = sqlite3.connect(DB_PATH, timeout=10)
    c = conn.cursor()
    created = datetime.now().isoformat()
    result_str = json.dumps(result) if result else None
    c.execute('''
        INSERT OR REPLACE INTO jobs (job_id, status, message, percent, mode, created, result)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (job_id, status, message, percent, mode, created, result_str))
    conn.commit()
    conn.close()

def worker_process(job_queue):
    while True:
        try:
            job_data = job_queue.get()
            if job_data is None:
                break

            job_id = job_data['job_id']
            target = job_data['target']
            args = job_data.get('args', ())
            kwargs = job_data.get('kwargs', {})

            update_job(job_id, status="running", message="Processing...", percent=0)

            try:
                result = target(*args, **kwargs)
                update_job(job_id, status="done", message="Video ready!", result=result)
            except Exception as e:
                update_job(job_id, status="error", message=str(e), trace=traceback.format_exc())

        except Exception as e:
            print(f"Worker process error: {e}")
            time.sleep(1)

class QueueManager:
    def __init__(self):
        self.queue = multiprocessing.Queue()
        self.worker = None

    def start(self):
        init_db()
        self.worker = multiprocessing.Process(target=worker_process, args=(self.queue,), daemon=True)
        self.worker.start()

    def submit(self, job_id, target, *args, **kwargs):
        self.queue.put({
            'job_id': job_id,
            'target': target,
            'args': args,
            'kwargs': kwargs
        })

    def stop(self):
        if self.worker:
            self.queue.put(None)
            self.worker.join()

engine_queue = QueueManager()
