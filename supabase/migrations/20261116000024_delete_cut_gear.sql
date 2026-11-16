-- Delete the gear cut at launch (Deon, 2026-11-16). The launch trim (20261115000023) only hid these rows
-- (active = false); now they go for good, leaving the 90 kept gear items. Also deletes the 92 exercises hidden with them,
-- which could only be done with that gear. No synced data pointed at those exercises on GFD Prod when this was written.
-- Saved gear lists (locations.gear, custom_exercises.gear) are plain text arrays: ids that no longer match a gear row are
-- ignored by the app, as hidden ones already were. Bodyweight, towel, wall and open floor space stay valid in an
-- exercise's req without being gear rows (FLOOR in src/js/rules.js). Source list: data/gear-library/launch-trim.json.
-- Rollback: supabase/rollbacks/20261116000024_delete_cut_gear.down.sql puts the rows back, hidden.

delete from public.exercises where id in (
  'atlas', 'axledl', 'beltmarch', 'beltsquat', 'curvedrun', 'curvedsprint', 'cycle', 'donkeycalf', 'elephant',
  'fatgripcurl', 'fatgriphold', 'feetstraps', 'ghdbackext', 'ghdhipext', 'ghdsitup', 'ghr', 'gripper', 'hamstretch',
  'humanflag', 'hurdlehop', 'ickyshuffle', 'ironcross', 'isopulldown', 'kneelcurl', 'kneestretch', 'laddercross',
  'ladderhopscotch', 'ladderlateral', 'ladderone', 'laddersinglehop', 'laddertwo', 'landminelateral',
  'landminepress', 'landminerdl', 'landminerevlunge', 'landminerot', 'landminesquat', 'landminesqueeze',
  'landminethruster', 'logpress', 'longstretch', 'machinedip', 'machuprightrow', 'meadows', 'mermaid',
  'multigymfly', 'multigymlegcurl', 'multigymlegext', 'multigympress', 'parachute', 'parapush', 'pendulum',
  'pilatesringsq', 'pullovermach', 'pullstraps', 'reformerfoot', 'reversehyp', 'ringbridge', 'ringcurl', 'ringdip',
  'ringleg', 'ringmu', 'ringpress', 'ringpush', 'ringrow', 'ringsupport', 'rowing', 'safetybarsquat', 'sandcarry',
  'sbbearsq', 'sbclean', 'sbload', 'sbpress', 'sbrow', 'sbshoulder', 'sbzercher', 'sealrow', 'shortspine',
  'speedbag', 'standlegcurl', 'strapadd', 'strapquad', 'swimbreast', 'swimfree', 'tbarrow', 'tdrill', 'tyreflip',
  'ube', 'versaclimb', 'vsquat', 'wristroller', 'yoke'
);

delete from public.gear where id in (
  'dipbelt', 'pushupboard', 'pushuphandles', 'fidbench', 'olybench', 'dipattach', 'benchboards', 'compbench',
  'convchest', 'declinepressm', 'bowbar', 'tsunamibar', 'multipress', 'plateincline', 'slingshot', 'comborack',
  'widechestm', 'tbar', 'romanchair', 'reversehyper', 'doorwaybar', 'landminehandle', 'latrowcombo', 'rackpulley',
  'wallbar', 'hyper90', 'deadliftm', 'highbench', 'lumbarext', 'leverpulldown', 'isorowm', 'pullblocks',
  'pulloverm', 'landmine', 'uprightrowm', 'therapyband', 'wristweights', 'jammer', 'jerkblocks', 'plateshoulder',
  'utilitybench', 'wristroller', 'gripper', 'fatgrips', 'fingerbands', 'flexbar', 'gripball', 'gyroball',
  'ricebucket', 'adjgripper', 'dipbars', 'cannonballs', 'hangboard', 'leverbar', 'armcombo', 'pinchblock',
  'rollinghandle', 'tricepbar', 'fixedbarbell', 'gripm', 'ohtricepm', 'platecurlm', 'dipm', 'swissbar', 'wristm',
  'pendulum', 'ghd', 'step', 'ankleweights', 'barpad', 'benchlegattach', 'fabricband', 'miniband', 'nordicstrap',
  'squatwedge', 'foldingrack', 'halfrack', 'hipthrustbench', 'jcups', 'legextcurl', 'hacklegpress', 'leversquat',
  'nordicbench', 'sissybench', 'sissym', 'safetyarms', 'squatstands', 'tibiam', 'beltsquat', 'buffalobar',
  'calibrated', 'cambered', 'deadliftbar', 'donkeycalfm', 'flywheel', 'hipextm', 'hipflexm', 'isolegpress',
  'kneellegcurl', 'monolift', 'multihip', 'openbar', 'powerbar', 'rotarycalf', 'ssb', 'standhipthrust',
  'standlegcurl', 'vsquat', 'vertlegpress', 'abstraps', 'balancedisc', 'kneepad', 'abrocker', 'abmat',
  'balancebeam', 'balanceboard', 'balancepad', 'balancepods', 'sliders', 'handlemedball', 'situpbar', 'slackline',
  'wobbleboard', 'abbackm', 'abcoaster', 'neckm', 'sandbag', 'multigym', 'adjdumbbells', 'adjkettlebell', 'bandbar',
  'collars', 'clubbell', 'foldingbench', 'hexdumbbells', 'inclinegym', 'pinpulley', 'loopband', 'digitalcable',
  'rodgym', 'shortbar', 'spinlockdb', 'standardbar', 'standardplates', 'steelmace', 'tubeband', 'compkettlebell',
  'digiplatform', 'dbrack', 'fractionalplates', 'digitalstation', 'platetree', 'platecable', 'leveragegym',
  'powertower', 'rackfunctional', 'cabletower', 'smithcombo', 'racksmith', 'techbar', 'techplates', 'trigrip',
  'wallpulley', 'digitalwall', 'womensbar', 'smith3d', 'airfunctional', 'compplates', 'hilopulley', 'jammerarms',
  'platform', 'cablejungle', 'rig', 'curvedtread', 'openwater', 'track', 'stadiumsteps', 'airwalker', 'bicycle',
  'bikerollers', 'turbotrainer', 'manualtread', 'hydrorower', 'magrower', 'ministepper', 'pedalexer', 'rebounder',
  'runshoes', 'goggles', 'swimkit', 'deskelliptic', 'walkingpad', 'nordicski', 'inclinetrainer', 'smartbike',
  'stepper', 'waterrower', 'antigravtread', 'arctrainer', 'bikeerg', 'jacobsladder', 'lateraltrainer', 'recumbstep',
  'treadwall', 'swimerg', 'pool', 'ube', 'versaclimber', 'calisthenics', 'rings', 'parallettes', 'pilatesmat',
  'reformer', 'pilatesring', 'stretchstrap', 'dowel', 'massagestick', 'zafu', 'peanutball', 'pilatesball',
  'backhook', 'yogablanket', 'yogastrap', 'flossband', 'gymgrips', 'massagegun', 'scraper', 'bolster', 'yogawheel',
  'aerialhammock', 'gymmat', 'handstandcanes', 'inversiontable', 'monkeybars', 'pilatestower', 'jumpboard',
  'spinecorrector', 'stallbars', 'pole', 'wundachair', 'climbrope', 'coldplunge', 'compboots', 'pbars',
  'ladderbarrel', 'pegboard', 'cadillac', 'salmonladder', 'stretchmachine', 'bulgarianbag', 'indianclubs',
  'sledgehammer', 'farmers', 'harness', 'ropepull', 'atlasstone', 'axlebar', 'cardeadlift', 'circusdb',
  'conanswheel', 'fingal', 'framecarry', 'husafell', 'keg', 'powerstairs', 'stoneplatform', 'log', 'shield',
  'tacky', 'tyre', 'vikingpress', 'yoke', 'gloves', 'doubleend', 'focusmitts', 'freebag', 'groinguard', 'wraps',
  'headgear', 'kickshield', 'tatami', 'mmagloves', 'mouthguard', 'reflexbag', 'shinguards', 'slipbag', 'thaipads',
  'wallbag', 'grapplingdummy', 'speedbag', 'bobdummy', 'bellypad', 'boxingring', 'uppercutbag', 'agilityladder',
  'speedrings', 'beadedrope', 'cones', 'cordlessrope', 'hurdles', 'reactionball', 'sandbell', 'slamball',
  'slideboard', 'parachute', 'speedrope', 'sprintharness', 'weightedrope', 'adjplyobox', 'agilitypoles', 'dragsled',
  'mbrebounder', 'reactlights', 'ropeball', 'softbox', 'wallball', 'ropeclimber', 'tanksled', 'carabiner',
  'dooranchor', 'loadingpin', 'ropeanchor', 'cablebelt', 'doublerope', 'neckharness', 'sledharness', 'wbtarget',
  'chalk', 'elbowsleeves', 'kneesleeves', 'liftstraps', 'liftshoes', 'wristwraps', 'deadliftjack', 'kneewraps',
  'accombands', 'chains', 'doorframe', 'hill', 'backpack', 'openspace', 'calispark', 'parkbench', 'playground',
  'sofa', 'housestairs', 'table', 'towel', 'wall', 'waterjugs', 'trailshoes'
);
