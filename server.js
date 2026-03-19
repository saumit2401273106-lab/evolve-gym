const express = require('express');
const cors = require('cors');
const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const adapter = new FileSync('db.json');
const db = low(adapter);

// Set default database structure
db.defaults({ users: [], attendance: [], trainerAttendance: [], progress: [], orders: [], dailyStats: [] }).write();

let dx = db.get('users').value();
if(!dx.some(u => u.role === 'member' && u.email === 'member@evolve.com')) {
    db.get('users').push({ id:'m1', name:'John Doe', email:'member@evolve.com', pass:'member123', role:'member', age:25, weight:80, targetWeight:70, plan:'Pro', reg: new Date().toLocaleDateString('en-CA') }).write()
}
if(!dx.some(u => u.role === 'trainer' && u.email === 'trainer@evolve.com')) {
    db.get('users').push({ id:'t1', name:'Raj Singh', email:'trainer@evolve.com', pass:'trainer123', role:'trainer', reg: new Date().toLocaleDateString('en-CA') }).write()
}

// Routes: Serve frontends
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// Super Admin Dump
app.get('/api/admin/dump', (req, res) => {
    let dsMap = {};
    let dailyVars = db.get('dailyStats').value() || [];
    dailyVars.forEach(d => dsMap[d.userId] = d);
    
    res.json({
        users: db.get('users').value() || [],
        attendance: db.get('attendance').value() || [],
        progress: db.get('progress').value() || [],
        orders: db.get('orders').value() || [],
        dailyStats: dsMap,
        trainerAttendance: db.get('trainerAttendance').value() || []
    });
});

// Member Logic API Routes
app.post('/api/register', (req, res) => {
    try {
        let existing = db.get('users').find({ email: req.body.email }).value()
        if(existing) return res.status(400).json({ error: 'Email already exists' })
        let user = {
            id: 'u' + Date.now(),
            name: req.body.name,
            email: req.body.email,
            pass: req.body.pass,
            age: req.body.age,
            weight: req.body.weight,
            targetWeight: req.body.targetWeight,
            plan: req.body.plan,
            role: 'member',
            reg: new Date().toLocaleDateString('en-CA')
        }
        db.get('users').push(user).write()
        res.json(user)
    } catch(err) {
        res.status(500).json({ error: err.message })
    }
});

app.post('/api/login', (req, res) => {
    try {
        let user = db.get('users').find({ email: req.body.email, pass: req.body.pass, role: req.body.role }).value()
        if(user) return res.json(user)
        res.status(401).json({ error: 'Invalid email or password' })
    } catch(err) {
        res.status(500).json({ error: err.message })
    }
});

app.get('/api/user/:userId', (req, res) => {
    let user = db.get('users').find({ id: req.params.userId }).value();
    user ? res.json(user) : res.status(404).json({error: 'Not found'});
});

app.post('/api/attendance/checkin', (req, res) => {
    try {
        let existing = db.get('attendance').find({ userId: req.body.userId, date: req.body.date }).value()
        if(existing) return res.status(400).json({ error: 'Already checked in today' })
        db.get('attendance').push({ ...req.body, ts: Date.now() }).write()
        res.json({ success: true })
    } catch(err) {
        res.status(500).json({ error: err.message })
    }
});

app.get('/api/attendance/:userId', (req, res) => {
    res.json(db.get('attendance').filter({ userId: req.params.userId }).value() || []);
});

app.get('/api/workout/:userId', (req, res) => {
    let user = db.get('users').find({ id: req.params.userId }).value();
    let daily = db.get('dailyStats').find({ userId: req.params.userId }).value() || { exercises: {}, meals: {} };
    res.json({ plan: user?.workoutPlan, completed: daily.exercises });
});

app.post('/api/workout/complete', (req, res) => {
    let { userId, day, exId, isDone } = req.body;
    let ds = db.get('dailyStats').find({ userId }).value();
    if(!ds) {
        db.get('dailyStats').push({userId, exercises: {}, meals: {}}).write();
        ds = db.get('dailyStats').find({ userId }).value();
    }
    let ex = ds.exercises || {};
    ex[`${day}_${exId}`] = isDone;
    db.get('dailyStats').find({ userId }).assign({ exercises: ex }).write();
    res.json({ success: true });
});

app.get('/api/diet/:userId', (req, res) => {
    let user = db.get('users').find({ id: req.params.userId }).value();
    let daily = db.get('dailyStats').find({ userId: req.params.userId }).value() || { exercises: {}, meals: {} };
    res.json({ plan: user?.dietPlan, completed: daily.meals });
});

app.post('/api/diet/eaten', (req, res) => {
    let { userId, date, mealId, isEaten } = req.body;
    let ds = db.get('dailyStats').find({ userId }).value();
    if(!ds) {
        db.get('dailyStats').push({userId, exercises: {}, meals: {}}).write();
        ds = db.get('dailyStats').find({ userId }).value();
    }
    
    let mls = ds.meals || {};
    mls[`${date}_${mealId}`] = isEaten;
    db.get('dailyStats').find({ userId }).assign({ meals: mls }).write();
    res.json({ success: true });
});

app.post('/api/progress/log', (req, res) => {
    try {
        db.get('progress').push({ ...req.body, date: new Date().toLocaleDateString('en-CA') }).write()
        res.json({ success: true })
    } catch(err) {
        res.status(500).json({ error: err.message })
    }
});

app.get('/api/progress/:userId', (req, res) => {
    res.json(db.get('progress').filter({ userId: req.params.userId }).value() || []);
});

app.get('/api/products', (req, res) => res.json([
    { id: "p1", name: "Whey Protein", price: 1499, icon: "🥛", desc: "High quality" },
    { id: "p2", name: "Creatine", price: 799, icon: "⚡", desc: "Strength boost" },
    { id: "p3", name: "Gym Gloves", price: 499, icon: "🧤", desc: "Grip support" },
    { id: "p4", name: "Shaker Bottle", price: 299, icon: "🥤", desc: "700ml" },
    { id: "p5", name: "Resistance Bands", price: 599, icon: "🎗", desc: "Versatile" },
    { id: "p6", name: "Pre-Workout", price: 999, icon: "🔥", desc: "Energy focus" }
]));

app.post('/api/cart/checkout', (req, res) => {
    db.get('orders').push({...req.body, date: new Date().toLocaleDateString('en-CA')}).write();
    res.json({ success: true });
});

// Trainer Routes & Guard Checks
const trainerOnly = (req,res,next) => { if (req.headers['x-role'] !== 'trainer') return res.status(403).json({error:'Forbidden'}); next(); };

app.get('/api/trainer/members', trainerOnly, (req, res) => {
    let memsRaw = db.get('users').filter({ role: 'member' }).value() || [];
    let mems = [];
    for(let u of memsRaw) {
        let atts = db.get('attendance').filter({ userId: u.id }).value() || [];
        mems.push({
            ...u, 
            attCount: atts.length, 
            hasWk: !!u.workoutPlan, hasDt: !!u.dietPlan,
            lastSeen: atts.length ? atts[atts.length-1].date : null
        });
    }
    res.json(mems);
});

app.get('/api/trainer/attendance/:trainerId', trainerOnly, (req, res) => {
    res.json(db.get('trainerAttendance').filter({ trainerId: req.params.trainerId }).value() || []);
});

app.post('/api/trainer/attendance', trainerOnly, (req, res) => {
    db.get('trainerAttendance').push(req.body).write();
    res.json({ success: true });
});

app.post('/api/trainer/assign/workout', trainerOnly, (req, res) => {
  try {
    let { memberId, planType, frequency, notes } = req.body
    let days = []
    if(planType.includes('Hypertrophy') || planType.includes('Powerlifting')) {
      days = [
        { day:'Monday', title:'Chest & Triceps', ex:[{id:'e1',n:'Bench Press',s:'4x10'},{id:'e2',n:'Incline Press',s:'3x12'},{id:'e3',n:'Cable Flyes',s:'3x15'},{id:'e4',n:'Tricep Dips',s:'3x12'},{id:'e5',n:'Tricep Pushdown',s:'3x15'}] },
        { day:'Tuesday', title:'Back & Biceps', ex:[{id:'e6',n:'Deadlift',s:'4x8'},{id:'e7',n:'Barbell Rows',s:'4x10'},{id:'e8',n:'Pull Ups',s:'3x8'},{id:'e9',n:'Bicep Curls',s:'3x12'},{id:'e10',n:'Hammer Curls',s:'3x12'}] },
        { day:'Wednesday', title:'Legs', ex:[{id:'e11',n:'Squats',s:'4x8'},{id:'e12',n:'Leg Press',s:'3x12'},{id:'e13',n:'Lunges',s:'3x10'},{id:'e14',n:'Leg Curls',s:'3x12'},{id:'e15',n:'Calf Raises',s:'4x15'}] },
        { day:'Thursday', title:'Shoulders', ex:[{id:'e16',n:'Overhead Press',s:'4x10'},{id:'e17',n:'Lateral Raises',s:'3x12'},{id:'e18',n:'Front Raises',s:'3x12'},{id:'e19',n:'Shrugs',s:'3x15'},{id:'e20',n:'Face Pulls',s:'3x15'}] },
        { day:'Friday', title:'Core & Cardio', ex:[{id:'e21',n:'Plank',s:'3x60s'},{id:'e22',n:'Crunches',s:'3x20'},{id:'e23',n:'Leg Raises',s:'3x15'},{id:'e24',n:'Russian Twists',s:'3x20'},{id:'e25',n:'Treadmill',s:'20 mins'}] },
        { day:'Saturday', title:'Full Body', ex:[{id:'e26',n:'Deadlift',s:'3x8'},{id:'e27',n:'Push Ups',s:'3x15'},{id:'e28',n:'Pull Ups',s:'3x10'},{id:'e29',n:'Goblet Squats',s:'3x12'},{id:'e30',n:'Farmer Walk',s:'3x30s'}] }
      ]
    } else {
      days = [
        { day:'Monday', title:'Full Body & Cardio', ex:[{id:'e1',n:'Jogging',s:'15 mins'},{id:'e2',n:'Burpees',s:'3x10'},{id:'e3',n:'Push Ups',s:'3x15'},{id:'e4',n:'Squats',s:'3x12'},{id:'e5',n:'Plank',s:'3x30s'}] },
        { day:'Tuesday', title:'Upper Body', ex:[{id:'e6',n:'Dumbbell Press',s:'3x12'},{id:'e7',n:'Rows',s:'3x12'},{id:'e8',n:'Shoulder Press',s:'3x12'},{id:'e9',n:'Bicep Curls',s:'3x15'},{id:'e10',n:'Tricep Dips',s:'3x15'}] },
        { day:'Wednesday', title:'Cardio', ex:[{id:'e11',n:'Cycling',s:'20 mins'},{id:'e12',n:'Jump Rope',s:'10 mins'},{id:'e13',n:'Mountain Climbers',s:'3x20'},{id:'e14',n:'High Knees',s:'3x30s'},{id:'e15',n:'Cool Down Stretch',s:'10 mins'}] },
        { day:'Thursday', title:'Lower Body', ex:[{id:'e16',n:'Squats',s:'3x15'},{id:'e17',n:'Lunges',s:'3x12'},{id:'e18',n:'Glute Bridges',s:'3x15'},{id:'e19',n:'Calf Raises',s:'3x20'},{id:'e20',n:'Leg Raises',s:'3x15'}] },
        { day:'Friday', title:'Core & Flexibility', ex:[{id:'e21',n:'Plank',s:'3x60s'},{id:'e22',n:'Crunches',s:'3x20'},{id:'e23',n:'Russian Twists',s:'3x20'},{id:'e24',n:'Yoga Stretch',s:'10 mins'},{id:'e25',n:'Meditation',s:'5 mins'}] },
        { day:'Saturday', title:'Active Recovery', ex:[{id:'e26',n:'Walking',s:'30 mins'},{id:'e27',n:'Light Stretching',s:'15 mins'},{id:'e28',n:'Foam Rolling',s:'10 mins'},{id:'e29',n:'Breathing Exercise',s:'5 mins'},{id:'e30',n:'Hydration Check',s:'Throughout day'}] }
      ]
    }
    db.get('users').find({ id: memberId }).assign({ workoutPlan: { type: planType, freq: frequency, notes, days } }).write()
    res.json({ success: true })
  } catch(err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/trainer/assign/diet', trainerOnly, (req, res) => {
  try {
    let { memberId, goal, calories, restrictions, macros } = req.body
    let bCal = Math.round(calories * 0.35)
    let lCal = Math.round(calories * 0.40)
    let dCal = calories - bCal - lCal
    let plan = {
      goal, cals: calories, restrict: restrictions, m: macros,
      meals: [
        { id:'b', n:'Breakfast', cals:bCal, items:['Oats with milk','3 Boiled eggs','Banana','Green tea','Almonds'] },
        { id:'l', n:'Lunch', cals:lCal, items:['Brown rice','Grilled chicken 200g','Mixed salad','Dal','Lemon water'] },
        { id:'d', n:'Dinner', cals:dCal, items:['Roti 3 pieces','Paneer curry','Vegetables','Curd','Cucumber salad'] }
      ]
    }
    db.get('users').find({ id: memberId }).assign({ dietPlan: plan }).write()
    res.json({ success: true })
  } catch(err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/trainer/stats', trainerOnly, (req, res) => {
    let td = new Date().toLocaleDateString('en-CA');
    let mCount = db.get('users').filter({ role: 'member' }).value().length;
    let chk = db.get('attendance').filter({ date: td }).value().length;
    let ts = db.get('trainerAttendance').filter({ type: 'clockin' }).value().length;
    
    let allAtt = db.get('attendance').value().length;
    let totalAtt = mCount ? Math.round((allAtt / (mCount * 30)) * 100) : 0;
    if (totalAtt > 100) totalAtt = 100;
    
    res.json({ totalMembers: mCount, checkedInToday: chk, avgAtt: totalAtt, trainerSessions: ts });
});

app.listen(3000, () => console.log('EVOLVE App heavily guarded backend listening at http://localhost:3000'));
