/* dice-physics.js — физика броска из принятой лаборатории.

   СОБРАН АВТОМАТИЧЕСКИ сборщиком dice/make-physics.py из
   grivensburg-dice-roll-lab.html. Руками не править: правка потеряется при
   пересборке, а физика обязана оставаться той, что приняли в лаборатории.

   Не знает ни Firebase, ни карточек, ни конкретной модели. Таблицы граней
   подаёт контроллер из сообщения шкурки «готова».

   Обычный скрипт, не модуль: игра открывается и двойным кликом (file://). */
(function (root) {
'use strict';
const PHYSICS_GEOMETRY={"20":{"hull":[[0.5027289986610413,0.8323400020599365,0.030594000592827797],[0.017281999811530113,0.5233510136604309,0.8265770077705383],[0.5190110206604004,0.832073986530304,0.012466000393033028],[0.03066300041973591,0.5027819871902466,0.8324689865112305],[0.5181710124015808,0.8077369928359985,0.049644000828266144],[0.5364189743995667,0.798524022102356,0.03601500019431114],[0.826433002948761,0.017211999744176865,0.5232120156288147],[0.8365560173988342,0.007685000076889992,0.5140849947929382],[-0.004778000060468912,0.5219339728355408,0.8319979906082153],[-0.014244000427424908,0.5381559729576111,0.8084719777107239],[-0.5063909888267517,0.8393020033836365,0.00761799979954958],[0.004772000014781952,0.5310919880867004,0.8218039870262146],[-0.48956501483917236,0.8425710201263428,0.00762900011613965],[0.46851998567581177,0.8382869958877563,0.030635999515652657],[0.506538987159729,0.8397579789161682,0.007701000198721886],[0.0077320002019405365,0.5142049789428711,0.8367800116539001],[0.0,0.5094220042228699,0.8397210240364075],[0.007739999797195196,0.5066109895706177,0.8399779796600342],[0.8273100256919861,-0.0,0.5267130136489868],[0.0382240004837513,0.4818980097770691,0.8340319991111755],[0.8152539730072021,-0.009484999813139439,0.534591019153595],[0.007666999939829111,-0.09807900339365005,0.8444859981536865],[0.014983000233769417,-0.4858039915561676,0.840283989906311],[-0.007708000019192696,0.4983200132846832,0.8418700098991394],[-0.007517999969422817,-0.49809300899505615,0.8406530022621155],[-0.015084000304341316,-0.5027819871902466,0.8379250168800354],[-0.030466999858617783,-0.4684950113296509,0.8378049731254578],[-0.03787599876523018,-0.4981200098991394,0.8293840289115906],[-0.05343199893832207,0.48123499751091003,0.8270570039749146],[-0.8273239731788635,-0.0,0.5267289876937866],[-0.8265069723129272,-0.009506000205874443,0.5261899828910828],[-0.8359490036964417,0.0,0.5166450142860413],[-0.015426999889314175,0.5108699798583984,0.836139976978302],[-0.80588698387146,0.03133000060915947,0.5333859920501709],[-0.8320720195770264,0.01246500015258789,0.5190100073814392],[-0.01729300059378147,0.523373007774353,0.8265990018844604],[-0.8311899900436401,0.020152000710368156,0.5155259966850281],[-0.5089100003242493,0.8022649884223938,0.06467200070619583],[-0.5152680277824402,0.8308050036430359,0.019957000389695168],[-0.5295990109443665,0.8199790120124817,0.01410599984228611],[-0.521448016166687,0.831430971622467,0.004693999886512756],[0.5218030214309692,0.8318449854850769,-0.004755000118166208],[0.8384199738502502,0.015242000110447407,-0.5029270052909851],[0.8390179872512817,0.0,-0.5091559886932373],[0.5261729955673218,0.8264920115470886,0.009500999934971333],[0.5386580228805542,0.8093590140342712,-0.004738999996334314],[0.8424829840660095,0.0153609998524189,0.47693100571632385],[0.8349270224571228,0.030635999515652657,0.49481499195098877],[0.8359339833259583,0.0,0.5166360139846802],[0.5166460275650024,0.8359509706497192,0.0],[-0.5091620087623596,0.8390340209007263,0.0],[0.4896079897880554,0.8429949879646301,-0.0076870000921189785],[-0.4982219934463501,0.8413450121879578,-0.007625999860465527],[0.5030540227890015,0.8388530015945435,-0.01537999976426363],[-0.49818500876426697,0.8295459747314453,-0.03796900063753128],[-0.44097599387168884,0.833503007888794,-0.04583200067281723],[0.009510999545454979,0.5347390174865723,-0.8153489828109741],[-0.004772999789565802,0.5310990214347839,-0.8218089938163757],[0.004776000045239925,0.5219219923019409,-0.8319839835166931],[0.5155360102653503,0.8312060236930847,-0.020160000771284103],[0.017278000712394714,0.5233420133590698,-0.8265669941902161],[0.5269119739532471,0.8200240135192871,-0.021942999213933945],[0.07138899713754654,0.5228350162506104,-0.7830389738082886],[0.805637001991272,0.031156999990344048,-0.5330569744110107],[0.8307920098304749,0.019951000809669495,-0.5152590274810791],[0.8314149975776672,0.00469100009649992,-0.5214329957962036],[0.5232160091400146,-0.8264359831809998,0.017212999984622],[0.514087975025177,-0.836562991142273,0.0076859998516738415],[0.826449990272522,-0.01721999980509281,0.5232290029525757],[0.8213239908218384,-0.04017399996519089,0.511264979839325],[0.029600000008940697,-0.5232120156288147,0.8188139796257019],[0.02735999971628189,-0.5110999941825867,0.8287590146064758],[0.012226000428199768,-0.5185040235519409,0.8314020037651062],[0.009440000168979168,-0.5259469747543335,0.8262860178947449],[0.0046259998343884945,-0.5210530161857605,0.8309720158576965],[0.8394820094108582,0.0,0.509332001209259],[0.8427540063858032,0.0,-0.4926629960536957],[0.8354769945144653,0.0,-0.5163530111312866],[0.8417689800262451,-0.007691999897360802,0.4983009994029999],[0.8359659910202026,-0.015363000333309174,0.5107870101928711],[0.8384090065956116,-0.015238000079989433,-0.5029240250587463],[0.567035973072052,-0.7442780137062073,-0.018792999908328056],[0.5499699711799622,-0.7788079977035522,0.03292899951338768],[0.5345960259437561,-0.8152570128440857,-0.009486000053584576],[0.5267189741134644,-0.8273159861564636,-0.0],[0.5217949748039246,-0.8318359851837158,-0.004753999877721071],[-0.017287999391555786,0.5233629941940308,-0.8265889883041382],[-0.5187159776687622,0.831682026386261,-0.01232600025832653],[-0.023072000592947006,0.5070019960403442,-0.8346059918403625],[-0.5089840292930603,0.8023480176925659,-0.06474699825048447],[-0.5360990166664124,0.7982890009880066,-0.035847000777721405],[-0.8261020183563232,0.0170499999076128,-0.5228930115699768],[-0.8361260294914246,0.007594999857246876,-0.5138530135154724],[-0.8354920148849487,0.0,-0.5163630247116089],[0.0077390000224113464,0.5066080093383789,-0.8399689793586731],[0.00737199978902936,-0.5132790207862854,-0.8350589871406555],[0.015432000160217285,0.5108770132064819,-0.836152970790863],[0.015193999744951725,-0.46773600578308105,-0.842100977897644],[0.030667999759316444,0.4863870143890381,-0.8366879820823669],[0.029776999726891518,-0.5021060109138489,-0.830826997756958],[0.8213750123977661,0.0047079999931156635,-0.5305010080337524],[-0.007726000156253576,0.5141890048980713,-0.8367499709129333],[-0.8213880062103271,0.00471000000834465,-0.5305190086364746],[-0.007706000003963709,0.49831798672676086,-0.8418629765510559],[-0.03066200017929077,0.4863849878311157,-0.8366739749908447],[-0.8091189861297607,-0.004708999767899513,-0.5382260084152222],[0.0,-0.4837630093097687,-0.8431320190429688],[-0.015212000347673893,-0.4946120083332062,-0.8401250243186951],[-0.030331000685691833,-0.5025280117988586,-0.8318529725074768],[-0.015080999583005905,-0.502780020236969,-0.8379169702529907],[-0.5091590285301208,-0.8390250205993652,0.0],[-0.4895640015602112,-0.8425639867782593,0.007627999875694513],[0.4947179853916168,-0.8407440185546875,0.015382999554276466],[0.5027250051498413,-0.8323299884796143,0.030587999150156975],[-0.4947119951248169,-0.8345379829406738,0.030455000698566437],[0.0047439998015761375,-0.5387309789657593,0.8094000220298767],[-0.004623999819159508,-0.5297330021858215,0.8208159804344177],[0.5232340097427368,-0.8264549970626831,-0.017223000526428223],[0.8307949900627136,-0.019951999187469482,-0.5152609944343567],[0.5107899904251099,-0.8359709978103638,-0.015364999882876873],[0.8261330127716064,-0.00939400028437376,-0.5257779955863953],[0.5072699785232544,-0.8272860050201416,-0.03541199862957001],[0.8097599744796753,-0.04178699851036072,-0.5222370028495789],[0.024795999750494957,-0.5194780230522156,-0.8252080082893372],[0.01424499973654747,-0.5300300121307373,-0.8203129768371582],[0.004623999819159508,-0.5210450291633606,-0.8309620022773743],[-0.0,-0.5257279872894287,-0.8264369964599609],[0.5012869834899902,-0.8418089747428894,0.0],[0.4819110035896301,-0.8341180086135864,-0.03826199844479561],[0.0,-0.534542977809906,-0.8155760169029236],[0.48062700033187866,-0.8436650037765503,-0.0076790000312030315],[-0.49062201380729675,-0.8385199904441833,-0.022885000333189964],[-0.4981819987297058,-0.8295400142669678,-0.03796600177884102],[-0.027358999475836754,-0.5110999941825867,0.8287590146064758],[-0.81700599193573,-0.03727699816226959,0.5191760063171387],[-0.5070620179176331,-0.8269240260124207,0.03517799824476242],[-0.5228859782218933,-0.8260949850082397,0.0170460008084774],[-0.5214390158653259,-0.831421971321106,0.00469199987128377],[-0.5138490200042725,-0.8361179828643799,0.007592999842017889],[-0.8432109951972961,0.0,0.49271801114082336],[-0.8390330076217651,0.0,-0.5091620087623596],[-0.8397560119628906,0.007699999958276749,0.506538987159729],[-0.8420829772949219,0.015269000083208084,-0.4769099950790405],[-0.8389400243759155,0.02303599938750267,0.4906899929046631],[-0.8345450162887573,0.0304579995572567,-0.49471399188041687],[-0.5346090197563171,0.815617024898529,0.0],[-0.5257949829101562,0.8261479735374451,-0.009398999623954296],[-0.8344590067863464,-0.023002000525593758,0.5069379806518555],[-0.8397449851036072,-0.007697999943047762,0.506534993648529],[-0.534201979637146,-0.8150060176849365,0.009417999535799026],[-0.5257840156555176,-0.8261370062828064,-0.00939599983394146],[-0.8351359963417053,-0.04633399844169617,-0.19708700478076935],[-0.8294519782066345,-0.04566400125622749,-0.48574298620224],[-0.8413439989089966,-0.007625999860465527,-0.4982219934463501],[-0.8361300230026245,-0.007596000097692013,-0.51385498046875],[-0.8261039853096008,-0.017051000148057938,-0.5228949785232544],[-0.036761000752449036,-0.5185689926147461,-0.8163419961929321],[-0.8232619762420654,-0.032326001673936844,-0.515330970287323],[-0.5228869915008545,-0.8260949850082397,-0.01704699918627739],[-0.51385098695755,-0.8361219763755798,-0.007594000082463026]],"radius":0.9827191829681396},"10":{"hull":[[0.0,0.0,1.0137779712677002],[0.009285000152885914,0.0,1.0106159448623657],[0.01221499964594841,0.008875000290572643,1.0061290264129639],[0.018609000369906425,0.0,1.0031830072402954],[0.8768849968910217,0.017815999686717987,0.11823099851608276],[0.8886650204658508,0.008829000405967236,0.10810499638319016],[0.720287024974823,0.5233190059661865,-0.10757099837064743],[0.723514974117279,0.5189129710197449,-0.10554199665784836],[0.8895059823989868,0.010936000384390354,0.10340599715709686],[0.8903239965438843,-0.0,0.10757099837064743],[0.7314890027046204,0.49752500653266907,-0.09254299849271774],[0.717028021812439,0.5277299880981445,-0.10144799947738647],[0.7199659943580627,0.5230860114097595,-0.09935300052165985],[0.2852729856967926,0.8425909876823425,0.10340599715709686],[0.2880130112171173,0.8399310111999512,0.10600800067186356],[0.2903909981250763,0.8361589908599854,0.10848599672317505],[0.27512499690055847,0.8467479944229126,0.10757099837064743],[-0.720287024974823,0.5233190059661865,0.10757099837064743],[0.0028689999599009752,0.008830999955534935,1.0106159448623657],[-0.004666000138968229,0.014360000379383564,1.0061290264129639],[-0.016945000737905502,0.03433400020003319,0.9811729788780212],[0.008630000054836273,0.026561999693512917,0.9942179918289185],[0.27319300174713135,0.8408030271530151,0.11746600270271301],[0.26622000336647034,0.8480420112609863,0.10816600173711777],[-0.26993700861930847,0.8484560251235962,-0.10554199665784836],[-0.2588540017604828,0.8497809767723083,-0.10120899975299835],[-0.2803269922733307,0.8450809717178345,-0.10554199665784836],[-0.27500298619270325,0.8463709950447083,-0.09935300052165985],[0.25084999203681946,0.8474230170249939,0.10625900328159332],[-0.7131969928741455,0.531686007976532,0.10340599715709686],[-0.7098209857940674,0.533469021320343,0.10600800067186356],[-0.7138429880142212,0.5296000242233276,0.10816600173711777],[-0.007511999923735857,-0.005458000116050243,1.0106159448623657],[-0.7152299880981445,-0.5196449756622314,0.11746600270271301],[-0.007511999923735857,0.005458000116050243,1.0106159448623657],[-0.015099000185728073,0.0,1.0061290264129639],[-0.04540099948644638,-0.02198999933898449,0.9701420068740845],[-0.7242699861526489,-0.515250027179718,0.10816600173711777],[-0.02259499952197075,0.016416000202298164,0.9942179918289185],[-0.718559980392456,0.5110740065574646,0.11801300197839737],[-0.8895059823989868,0.010936000384390354,-0.10340599715709686],[-0.72605299949646,0.5139909982681274,0.10340599715709686],[-0.8903449773788452,-0.005462000146508217,-0.10554199665784836],[-0.890828013420105,0.0,-0.10355900228023529],[-0.8876060247421265,0.016467999666929245,-0.09703700244426727],[-0.7242699861526489,0.515250027179718,0.10816600173711777],[-0.7307279706001282,-0.49956899881362915,0.10155999660491943],[-0.730322003364563,-0.4950129985809326,0.10401300340890884],[-0.7282000184059143,-0.5087810158729553,0.10120899975299835],[-0.004666000138968229,-0.014360000379383564,1.0061290264129639],[0.26622000336647034,-0.8480420112609863,0.10816600173711777],[-0.015054999850690365,-0.010937999933958054,1.0031830072402954],[-0.016945000737905502,-0.03433400020003319,0.9811729788780212],[-0.7138429880142212,-0.5296000242233276,0.10816600173711777],[-0.720287024974823,-0.5233190059661865,0.10757099837064743],[-0.7089059948921204,-0.535336971282959,0.10120899975299835],[-0.27528101205825806,-0.8472279906272888,-0.10355900228023529],[-0.2803269922733307,-0.8450120091438293,-0.10144799947738647],[-0.26376500725746155,-0.8473770022392273,-0.09494999796152115],[0.8840230107307434,-0.0,0.11742299795150757],[0.0028689999599009752,-0.008830999955534935,1.0106159448623657],[0.01221499964594841,-0.008875000290572643,1.0061290264129639],[0.03094400092959404,-0.008894000202417374,0.9891319870948792],[0.8886650204658508,-0.008829000405967236,0.10810499638319016],[0.008630000054836273,-0.026561999693512917,0.9942179918289185],[0.280925989151001,-0.8358259797096252,0.11801300197839737],[0.27512499690055847,-0.8467479944229126,0.10757099837064743],[0.720287024974823,-0.5233190059661865,-0.10757099837064743],[0.7044180035591125,-0.5388450026512146,-0.09898299723863602],[0.2880130112171173,-0.8399310111999512,0.10600800067186356],[0.7282000184059143,-0.5087810158729553,-0.10120899975299835],[0.7093579769134521,-0.5289880037307739,-0.09052799642086029],[0.7277669906616211,-0.5083990097045898,-0.09703700244426727],[0.8903449773788452,-0.005462000146508217,0.10554199665784836],[0.0,0.0,-1.0137779712677002],[0.007511999923735857,0.005458000116050243,-1.0106159448623657],[0.015054999850690365,0.010937999933958054,-1.0031830072402954],[0.7152299880981445,0.5196449756622314,-0.11746600270271301],[-0.0028689999599009752,0.008830999955534935,-1.0106159448623657],[0.004666000138968229,0.014360000379383564,-1.0061290264129639],[0.012236000038683414,0.019878000020980835,-0.9982380270957947],[-0.27319300174713135,0.8408030271530151,-0.11746600270271301],[0.26993700861930847,0.8484560251235962,0.10554199665784836],[-0.27512499690055847,0.8467479944229126,-0.10757099837064743],[0.2643109858036041,0.8489800095558167,0.09926199913024902],[-0.26622000336647034,0.8480420112609863,-0.10816600173711777],[0.27500298619270325,0.8463709950447083,0.09935300052165985],[-0.25084999203681946,0.8474230170249939,-0.10625900328159332],[0.7131969928741455,0.531686007976532,-0.10340599715709686],[0.7098180055618286,0.5334640145301819,-0.10600599646568298],[-0.005750000011175871,0.017697999253869057,-1.0031830072402954],[-0.009285000152885914,0.0,-1.0106159448623657],[-0.01221499964594841,0.008875000290572643,-1.0061290264129639],[-0.2830899953842163,0.8425610065460205,-0.10816600173711777],[-0.018609000369906425,0.0,-1.0031830072402954],[-0.2903909981250763,0.8361589908599854,-0.10848599672317505],[-0.03094400092959404,0.008894000202417374,-0.9891319870948792],[-0.8903239965438843,0.0,-0.10757099837064743],[-0.7206950187683105,0.5236160159111023,0.10355900228023529],[-0.729656994342804,0.5029829740524292,0.09479399770498276],[-0.8888030052185059,0.008868999779224396,-0.10816600173711777],[-0.717028021812439,0.5277299880981445,0.10144799947738647],[-0.7199659943580627,0.5230860114097595,0.09935300052165985],[-0.8840720057487488,0.0,-0.11746600270271301],[-0.0028689999599009752,-0.008830999955534935,-1.0106159448623657],[-0.01221499964594841,-0.008875000290572643,-1.0061290264129639],[-0.02158300019800663,-0.0088900001719594,-0.9982380270957947],[-0.8888030052185059,-0.008868999779224396,-0.10816600173711777],[-0.005750000011175871,-0.017697999253869057,-1.0031830072402954],[-0.280925989151001,-0.8358259797096252,-0.11801300197839737],[-0.27512499690055847,-0.8467479944229126,-0.10757099837064743],[-0.7170940041542053,-0.5277510285377502,0.10554199665784836],[-0.2803269922733307,-0.8450809717178345,-0.10554199665784836],[-0.717028021812439,-0.5277299880981445,0.10144799947738647],[-0.2928049862384796,-0.8368989825248718,-0.10379700362682343],[-0.7257519960403442,-0.5137240290641785,0.09926199913024902],[-0.718288004398346,-0.5218669772148132,0.09499700367450714],[0.007511999923735857,-0.005458000116050243,-1.0106159448623657],[-0.26401299238204956,-0.8413220047950745,-0.11801300197839737],[0.015054999850690365,-0.010937999933958054,-1.0031830072402954],[0.009362000040709972,-0.028814999386668205,-0.9902870059013367],[0.7138429880142212,-0.5296000242233276,-0.10816600173711777],[0.2803269922733307,-0.8450809717178345,0.10554199665784836],[0.26993700861930847,-0.8484560251235962,0.10554199665784836],[0.27528101205825806,-0.8472279906272888,0.10355900228023529],[0.2803269922733307,-0.8450120091438293,0.10144799947738647],[0.2580280005931854,-0.8475239872932434,0.09270499646663666],[-0.2301889955997467,-0.8501380085945129,-0.09000100195407867],[-0.2531610131263733,-0.8499810099601746,-0.09898299723863602],[-0.26993700861930847,-0.8484560251235962,-0.10554199665784836],[0.7152299880981445,-0.5196449756622314,-0.11746600270271301],[0.015099000185728073,-0.0,-1.0061290264129639],[0.022686000913381577,-0.005493999924510717,-0.9982380270957947],[0.7264130115509033,-0.5057799816131592,-0.10848599672317505],[0.718559980392456,0.5110740065574646,-0.11801300197839737],[0.890828013420105,-0.0,0.10355900228023529],[0.7267060279846191,0.5102289915084839,-0.10600800067186356],[0.7242699861526489,0.515250027179718,-0.10816600173711777],[0.8874120116233826,0.010998000390827656,0.09494999796152115],[0.7288010120391846,-0.504958987236023,-0.10379700362682343],[0.7242699861526489,-0.515250027179718,-0.10816600173711777]],"radius":1.0137776136398315}};
function createDicePhysics(opts) {
    opts = opts || {};
    /* ── Заглушки интерфейса лаборатории. Тела функций их зовут, но показ
       результата — забота контроллера и стримера, не физики. ── */
    const noop = function () {};
    const заглушка = { textContent: '', value: '', classList: { add: noop, remove: noop, toggle: noop } };
    /* Размер сцены — НАСТОЯЩИЙ вход физики: по нему она решает, как далеко
       кубик может укатиться, не вылетев за край. Лаборатория брала его у
       своего окна просмотра ($('stage')); здесь его задаёт контроллер. */
    let сцена = { width: (opts.stage && opts.stage.width) || 1920,
                   height: (opts.stage && opts.stage.height) || 1080 };
    const сценаЭлемент = { getBoundingClientRect: function () { return { width: сцена.width, height: сцена.height }; } };
    const $ = function (id) { return id === 'stage' ? сценаЭлемент : заглушка; };
    /* В лаборатории объявлен одной строкой с $ («const $=…,TAU=Math.PI*2»),
       поэтому по имени не извлекается — переносим значение как есть. */
    const TAU = Math.PI * 2;
    const updateStatus = noop, render = noop, broadcast = noop, persist = noop;
    const CustomEvent = function (type, init) { this.type = type; this.detail = init && init.detail; };
    const window = { dispatchEvent: function (e) { if (opts.onSettled) opts.onSettled(e.detail); } };
    const performance = { now: function () { return opts.now ? opts.now() : Date.now(); } };
    /* Таблицы граней — от шкурки. 11 — второй D10 пары, раскладка та же. */
    const renderers = {};
    function задатьГрани(d, faces) {
        const t = { ready: true,
            values:  faces.map(function (f) { return f.value; }),
            normals: faces.map(function (f) { return f.normal; }),
            ups:     faces.map(function (f) { return f.up; }) };
        renderers[d] = t;
        if (d === 10) renderers[11] = t;
    }
    Object.keys(opts.faces || {}).forEach(function (d) { задатьГрани(Number(d), opts.faces[d]); });

    let die=20,modeIndex=0,loaded=false,streamWindow=null,lastTime=null,autoTick=true,latestPose=null,wireSnapshot=null;
    loaded = true;

    /* ── ДОСЛОВНО ИЗ ЛАБОРАТОРИИ ─────────────────────────────────────── */

const MODES=[
 {id:'orbit',title:'Падение по кругу',sub:'Падение → боковой отскок → круг',period:4.8,entry:1.30,settle:1.8,spin:3.8},
 {id:'top',title:'Волчок',sub:'Вращение на кончике → на бок',period:3.6,entry:.95,settle:2.0,spin:8.2},
 {id:'bounce',title:'Прыгучая кость',sub:'Восемь прыжков → волчок → результат',period:3.7,entry:.72,settle:.48,spin:4.8},
 {id:'sweep',title:'Бросок со стола',sub:'Бросок сбоку → перекат → круг',period:4.1,entry:1.70,settle:1.75,spin:5.2}
];
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x)),lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t);return t*t*t*(t*(t*6-15)+10)};
const vdot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const vcross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normalize=a=>{let l=Math.hypot(...a);return a.map(x=>x/l)};
const Q={
 identity:[0,0,0,1],
 mul(a,b){return [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]]},
 axis(axis,a){const s=Math.sin(a/2);return [axis[0]*s,axis[1]*s,axis[2]*s,Math.cos(a/2)]},
 x(a){return this.axis([1,0,0],a)},y(a){return this.axis([0,1,0],a)},z(a){return this.axis([0,0,1],a)},
 inv(q){return [-q[0],-q[1],-q[2],q[3]]},
 pow(q,t){q=normalize(q);if(q[3]<0)q=q.map(x=>-x);let a=Math.acos(clamp(q[3],-1,1));if(a<1e-8)return this.identity.slice();let s=Math.sin(a*t)/Math.sin(a);return [q[0]*s,q[1]*s,q[2]*s,Math.cos(a*t)]},
 rows(q){let [x,y,z,w]=q;return [[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]},
 fromRows(m){const [a,b,c]=m;let q,s,t=a[0]+b[1]+c[2];if(t>0){s=Math.sqrt(t+1)*2;q=[(c[1]-b[2])/s,(a[2]-c[0])/s,(b[0]-a[1])/s,s/4]}else if(a[0]>b[1]&&a[0]>c[2]){s=Math.sqrt(1+a[0]-b[1]-c[2])*2;q=[s/4,(a[1]+b[0])/s,(a[2]+c[0])/s,(c[1]-b[2])/s]}else if(b[1]>c[2]){s=Math.sqrt(1+b[1]-a[0]-c[2])*2;q=[(a[1]+b[0])/s,s/4,(b[2]+c[1])/s,(a[2]-c[0])/s]}else{s=Math.sqrt(1+c[2]-a[0]-b[1])*2;q=[(a[2]+c[0])/s,(b[2]+c[1])/s,s/4,(b[0]-a[1])/s]}return normalize(q)}
};
let prefs={};
let state={phase:'idle',t:0,spin:0,result:null,boundary:null,finish:null};
let secondState=null,pairBusy=false;
function withSecond(fn){const first=state;state=secondState;try{return fn()}finally{secondState=state;state=first}}
function scenePhase(){if(die!==10||!secondState)return state.phase;const phases=[state.phase,secondState.phase];return phases.includes('rolling')?'rolling':phases.includes('stopping')?'stopping':phases.every(p=>p==='done')?'done':'idle'}
function selectedFaces(){return die===10&&secondState?[state.result,secondState.result]:[state.result]}
function settings(){const key=die+'-'+MODES[modeIndex].id;let p=prefs[key];if(!p||typeof p!=='object')p=prefs[key]={tempo:1,rotation:1};p.tempo=clamp(Number(p.tempo)||1,.25,2.5);p.rotation=clamp(Number(p.rotation)||1,.15,3);p.completion=clamp(Number(p.completion)||1.3,1,3);return p}
function faceQuaternion(value,type=die){const r=renderers[type],i=r.values.indexOf(value);if(i<0)throw Error('Нет такой грани: '+value);const n=r.normals[i],up=r.ups[i],right=normalize(vcross(up,n));return Q.fromRows([right,up,n])}
function resting(value,type=die){return {x:0,y:.02,h:0,scale:1.30,q:faceQuaternion(value,type)}}
function idlePose(){return {x:0,y:.02,h:0,scale:1.2,q:Q.mul(Q.y(-.20),Q.mul(Q.x(.13),faceQuaternion(die)))}}

const GROUND_S=.23/.74,GROUND_C=Math.sqrt(1-GROUND_S*GROUND_S),GROUND_N=[0,GROUND_C,GROUND_S];
const MODEL_SCALE=.43,BASE_HEIGHT=.37,PHYS_STEP=1/180;
const BOUNCE_HEIGHTS=[.92,.69,.49,.33,.21,.12,.055,.018];
const BOUNCE_DURATIONS=BOUNCE_HEIGHTS.map(h=>Math.sqrt(8*h/4.8));
const BOUNCE_LENGTH=BOUNCE_DURATIONS.reduce((a,b)=>a+b,0),BOUNCE_END=.72+BOUNCE_LENGTH;
const ARC_START=Math.asin(.48/.74);
const vmul=(v,s)=>v.map(x=>x*s),vadd=(a,b)=>a.map((x,i)=>x+b[i]);
function transformed(q,v){return Q.rows(q).map(row=>vdot(row,v))}
function shortestRotation(a,b){a=normalize(a);b=normalize(b);const c=vcross(a,b),dot=clamp(vdot(a,b),-1,1);if(dot<-.999999){const axis=normalize(vcross(a,Math.abs(a[0])<.8?[1,0,0]:[0,1,0]));return Q.axis(axis,Math.PI)}return normalize([...c,1+dot])}
function slerp(a,b,t){return Q.mul(Q.pow(Q.mul(b,Q.inv(a)),t),a)}
function support(q){const rows=Q.rows(q),local=[0,1,2].map(i=>rows[0][i]*GROUND_N[0]+rows[1][i]*GROUND_N[1]+rows[2][i]*GROUND_N[2]);let lo=Infinity;for(const v of PHYSICS_GEOMETRY[die].hull)lo=Math.min(lo,vdot(local,v));return Math.max(.20,-lo*MODEL_SCALE)}
function hermite(p0,p1,v0,v1,u,T){return (2*u*u*u-3*u*u+1)*p0+(u*u*u-2*u*u+u)*T*v0+(-2*u*u*u+3*u*u)*p1+(u*u*u-u*u)*T*v1}
function circle(a){return {x:.74*Math.sin(a),y:.23*(1-Math.cos(a))}}
function bounceHeight(run){let elapsed=0;for(let i=0;i<BOUNCE_HEIGHTS.length;i++){const T=BOUNCE_DURATIONS[i];if(run<elapsed+T){const u=clamp((run-elapsed)/T);return 4*BOUNCE_HEIGHTS[i]*u*(1-u)}elapsed+=T}return 0}
function pathAt(t,idx=modeIndex){const m=MODES[idx],run=Math.max(0,t-m.entry),w=TAU/m.period;let x=0,y=0,h=0;
 if(m.id==='orbit'){
  const hit=.72,T=m.entry-hit,landing=circle(ARC_START);
  if(t<hit)h=2.8*(1-(t/hit)**2);
  else if(t<m.entry){const u=(t-hit)/T;x=hermite(0,landing.x,.98,.74*Math.cos(ARC_START)*w,u,T);y=hermite(0,landing.y,0,.23*Math.sin(ARC_START)*w,u,T);h=4*.27*u*(1-u)}
  else ({x,y}=circle(ARC_START+run*w));
 }else if(m.id==='sweep'){
  const hit=.70,landing=circle(-ARC_START),vx=.74*Math.cos(ARC_START)*w,vy=-.23*Math.sin(ARC_START)*w;
  if(t<m.entry){x=landing.x+vx*(t-m.entry);y=landing.y+vy*(t-m.entry);if(t<hit)h=.8*(1-(t/hit)**2)}
  else ({x,y}=circle(-ARC_START+run*w));
 }else if(m.id==='bounce'){
  if(t<m.entry){h=2.8*(1-(t/m.entry)**2);y=.16*smooth(t/m.entry)}
  else {const u=clamp(run/BOUNCE_LENGTH),a=TAU*(1-(1-u)**2);x=.62*Math.sin(a);y=.08*Math.sin(2*a)+.16*(1-smooth(u));h=bounceHeight(run)}
 }else if(t<m.entry){const u=t/m.entry;h=2.8*Math.max(0,1-(u/.7)**2)+(u>.7?Math.sin((u-.7)/.3*Math.PI)*.19:0)}
 return {x,y,h};
}
function topBase(){const pole=die===10?[0,0,1]:normalize([0,1,(1+Math.sqrt(5))/2]);return shortestRotation(pole,GROUND_N)}
function newMotion(){const p=pathAt(0),q=MODES[modeIndex].id==='top'?topBase():Q.mul(Q.y(-.22),faceQuaternion(die));return {t:0,q,x:p.x,y:p.y,air:p.h,v:[0,0,0],omega:[0,0,0],join:null}}
function isGroundRoll(){return ['orbit','sweep'].includes(MODES[modeIndex].id)}
function inTop(m){return MODES[modeIndex].id==='top'||(MODES[modeIndex].id==='bounce'&&m.t>=BOUNCE_END)}
function canStop(m){if(m.retryAfter&&m.t<m.retryAfter)return false;const id=MODES[modeIndex].id;return m.air<.001&&(id==='bounce'?m.t>=BOUNCE_END+.50:id==='orbit'?m.t>=MODES[modeIndex].entry:id==='sweep'?m.t>=.70:m.t>=MODES[modeIndex].entry)}
function groundRotate(m,dx,dy){const travel=[dx,-dy,dy*GROUND_C/GROUND_S],ds=Math.hypot(...travel);if(ds<1e-12)return;const axis=normalize(vcross(GROUND_N,travel));const r0=support(m.q),half=Q.mul(Q.axis(axis,ds/r0*.5),m.q),radius=support(half);m.q=normalize(Q.mul(Q.axis(axis,ds/radius),m.q));return {axis,angle:ds/radius,ds,radius}}
function bounceSpinStep(m,dt,p){
 const run=Math.max(0,m.t-.72),bend=smooth((run/BOUNCE_LENGTH-.40)/.38),airAxis=normalize([.65,.28,-.75]);
 const axis=normalize(vadd(vmul(airAxis,1-bend),vmul(GROUND_N,-bend))),rate=lerp(4.2,8.2,bend)*p.rotation;
 let omega=vmul(axis,rate);const alignment=smooth((m.t-(BOUNCE_END-2.2))/.45);
 if(alignment>0){
  if(!m.bouncePole){m.bouncePole=die===10?[0,0,1]:normalize([0,1,(1+Math.sqrt(5))/2]);if(vdot(transformed(m.q,m.bouncePole),GROUND_N)<0)m.bouncePole=vmul(m.bouncePole,-1)}
  const up=normalize(transformed(m.q,m.bouncePole)),cross=vcross(up,GROUND_N),error=Math.acos(clamp(vdot(up,GROUND_N),-1,1));
  if(Math.hypot(...cross)>1e-8){let correction=vmul(normalize(cross),Math.min(1.35*p.rotation,error*4)*alignment);if(correction[2]>0){const cap=clamp((-.035*p.rotation-omega[2])/correction[2]);correction=vmul(correction,cap)}omega=vadd(omega,correction)}
 }
 const speed=Math.hypot(...omega);m.q=normalize(Q.mul(Q.axis(vmul(omega,1/speed),speed*dt),m.q));m.omega=omega;m.spinSign=-1;
}
function motionStep(m,dt,p=settings()){
 const realDt=dt;dt*=m.timeRate||1;if(m.spinRate)p={...p,rotation:p.rotation*m.spinRate};
 const id=MODES[modeIndex].id,oldT=m.t,oldX=m.x,oldY=m.y;
 m.t+=dt*(isGroundRoll()?p.rotation:1);const pos=pathAt(m.t);m.x=pos.x;m.y=pos.y;m.air=pos.h*(m.heightScale||1);
 if(isGroundRoll()){
  const k=groundRotate(m,m.x-oldX,m.y-oldY);m.omega=k?vmul(k.axis,k.angle/dt):[0,0,0];
 }else if(id==='bounce'){bounceSpinStep(m,dt,p);
 }else if(inTop(m)){
  if(id==='bounce'&&!m.join){const pole=die===10?[0,0,1]:normalize([0,1,(1+Math.sqrt(5))/2]);let up=transformed(m.q,pole);if(vdot(up,GROUND_N)<0)up=vmul(up,-1);m.join={at:m.t,base:m.q,fix:shortestRotation(up,GROUND_N),angle:0}}
  const angle=8.2*p.rotation*dt;
  if(m.join&&m.t-m.join.at<.5){m.join.angle+=angle;const aligned=Q.mul(Q.pow(m.join.fix,smooth((m.t-m.join.at)/.5)),m.join.base);m.q=Q.mul(Q.axis(GROUND_N,m.join.angle),aligned)}
  else {if(m.join&&oldT-m.join.at<.5){m.join.angle+=angle;m.q=Q.mul(Q.axis(GROUND_N,m.join.angle),Q.mul(m.join.fix,m.join.base))}else m.q=Q.mul(Q.axis(GROUND_N,angle),m.q)}
  m.omega=vmul(GROUND_N,8.2*p.rotation);
 }else {const axis=normalize([.65,.28,-.75]),angle=4.2*p.rotation*dt;m.q=normalize(Q.mul(Q.axis(axis,angle),m.q));m.omega=vmul(axis,angle/dt)}
 m.v=[(m.x-oldX)/realDt,-(m.y-oldY)/realDt,(m.y-oldY)/realDt*GROUND_C/GROUND_S];m.omega=vmul(m.omega,m.timeRate||1);
}
function motionPose(m){return {x:m.x,y:m.y,h:(m.air+support(m.q)-BASE_HEIGHT)*GROUND_C,air:m.air,scale:1,q:m.q.slice()}}
function normalOf(q,value){return transformed(q,renderers[die].normals[renderers[die].values.indexOf(value)])}
function visibility(q,value){const r=renderers[die],row=Q.rows(q)[2],i=r.values.indexOf(value),score=vdot(row,r.normals[i]);let best=-1;for(const n of r.normals)best=Math.max(best,vdot(row,n));return {score,dominant:score>=best-.015}}
function readablyFront(q,value){const s=visibility(q,value);return s.dominant&&s.score>=.74}
function copyMotion(m){return JSON.parse(JSON.stringify(m))}
function traceItem(m,t){return {x:m.x,y:m.y,q:m.q.slice(),air:m.air,t}}
function naturalStopTrace(m,value,p){let probe=copyMotion(m),trace=[traceItem(probe,0)],dt=1/120;
 const speed=Math.max(.1,Math.hypot(...m.omega)),limit=Math.min(8,Math.PI*1.2/speed);
 for(let t=dt;t<=limit;t+=dt){motionStep(probe,dt,p);trace.push(traceItem(probe,t));if(t>=.055&&readablyFront(probe.q,value))return trace}return null;
}
function surfaceAim(q,value){const n=normalOf(q,value),front=[0,0,1];let axis=vcross(GROUND_N,vadd(n,vmul(front,-1)));if(Math.hypot(...axis)<1e-7)axis=normalize(vcross(GROUND_N,n));else axis=normalize(axis);const a=vdot(axis,n);let angle=Math.atan2(vdot(axis,vcross(n,front)),vdot(n,front)-a*a);if(angle<0){axis=vmul(axis,-1);angle=-angle}return {axis,angle}}
function travelAngular(m,axis,angle){const half=Q.mul(Q.axis(axis,angle/2),m.q),ds=angle*support(half),dir=vcross(axis,GROUND_N);m.q=normalize(Q.mul(Q.axis(axis,angle),m.q));m.x+=dir[0]*ds;m.y-=dir[1]*ds;m.air=0;return ds}

function aimedRollTrace(m,value,p){let probe=copyMotion(m),trace=[traceItem(probe,0)],time=0;const speed=Math.max(.35,Math.hypot(...m.v)||.85*p.rotation),dt=1/120;
 const aim=surfaceAim(probe.q,value),initial=Math.hypot(...m.v)>.02?normalize(vcross(GROUND_N,m.v)):aim.axis;
 for(let i=0;i<18;i++){const desired=surfaceAim(probe.q,value);if(desired.angle<.018)break;const u=(i+1)/18;let axis=vadd(vmul(initial,1-smooth(u)),vmul(desired.axis,smooth(u)));if(Math.hypot(...axis)<.1)axis=desired.axis;axis=normalize(axis);const angle=Math.min(desired.angle,speed/support(probe.q)*dt);travelAngular(probe,axis,angle);time+=dt;trace.push(traceItem(probe,time))}
 const finalAim=surfaceAim(probe.q,value),steps=Math.max(1,Math.ceil(finalAim.angle/.018));
 for(let i=0;i<steps;i++){const angle=finalAim.angle/steps,ds=travelAngular(probe,finalAim.axis,angle);time+=ds/speed;trace.push(traceItem(probe,time))}
 return trace;
}
function boundedRollTrace(m,value,p){
 const box=$('stage').getBoundingClientRect(),unit=Math.min(box.width*.40,box.height*.43),maxX=Math.max(.76,Math.min(1.15,box.width/(2*unit)-.49));
 let probe=copyMotion(m),prefix=[traceItem(probe,0)],time=0,best=null,bestCost=Infinity;const dt=1/120;
 for(let i=0;i<=288;i++){
  if(i%12===0){const tail=aimedRollTrace(probe,value,p),candidate=prefix.concat(tail.slice(1).map(f=>({...f,t:f.t+time})));let spill=0;for(const f of candidate)spill=Math.max(spill,Math.abs(f.x)-maxX,f.y-.67,-.67-f.y);if(spill<=0)return candidate;const cost=spill*10+candidate.at(-1).t*.02;if(cost<bestCost){bestCost=cost;best=candidate}}
  motionStep(probe,dt,p);time+=dt;prefix.push(traceItem(probe,time));if(readablyFront(probe.q,value))return prefix;
 }return best;
}

function topSpiralStopTrace(m,value,p){
 const target=faceQuaternion(value),relative=normalize(Q.mul(target,Q.inv(m.q))),projection=vdot(relative.slice(0,3),GROUND_N);
 let angle=2*Math.atan2(projection,relative[3]);angle=((angle%TAU)+TAU)%TAU;
 if(angle<1.25)angle+=TAU;
 const speed=8.2*p.rotation,duration=Math.min(3*angle/speed,Math.max(2*angle/speed,.42/Math.sqrt(p.rotation)));
 const twist=Q.axis(GROUND_N,angle),swing=normalize(Q.mul(relative,Q.inv(twist))),probe=copyMotion(m),trace=[traceItem(probe,0)],steps=Math.max(60,Math.ceil(duration*180));
 for(let i=1;i<=steps;i++){
  const u=i/steps,k=smooth(u),phase=hermite(0,angle,speed,0,u,duration),previous=probe.q;
  probe.q=normalize(Q.mul(Q.pow(swing,k),Q.mul(Q.axis(GROUND_N,phase),m.q)));
  let dq=normalize(Q.mul(probe.q,Q.inv(previous)));if(dq[3]<0)dq=dq.map(v=>-v);
  const sine=Math.hypot(...dq.slice(0,3)),a=2*Math.atan2(sine,dq[3]);
  if(sine>1e-10){const axis=vmul(dq.slice(0,3),1/sine),radius=support(slerp(previous,probe.q,.5)),travel=vmul(vcross(axis,GROUND_N),a*radius);probe.x+=travel[0];probe.y-=travel[1];}
  probe.air=0;trace.push(traceItem(probe,u*duration));
 }
 return trace;
}
function topStopTrace(m,value,p){if(MODES[modeIndex].id==='top'&&die===10)return topSpiralStopTrace(m,value,p);let probe=copyMotion(m),trace=[traceItem(probe,0)],time=0;const speed=8.2*p.rotation,dt=1/120;
 if(!readablyFront(probe.q,value)){
  const n=normalOf(probe.q,value),front=[0,0,1];let delta=Math.atan2(vdot(GROUND_N,vcross(n,front)),vdot(n,front)-vdot(n,GROUND_N)*vdot(front,GROUND_N));if(delta<0)delta+=TAU;if(MODES[modeIndex].id==='bounce'&&delta>0)delta-=TAU;
  const steps=Math.max(1,Math.ceil(Math.abs(delta)/.045));for(let i=0;i<steps;i++){const a=delta/steps;probe.q=Q.mul(Q.axis(GROUND_N,a),probe.q);time+=Math.abs(a)/speed;trace.push(traceItem(probe,time))}
 }
 const aim=surfaceAim(probe.q,value),steps=Math.max(1,Math.ceil(aim.angle/.022)),fallDuration=clamp(aim.angle/3,.16,.48);
 if(MODES[modeIndex].id==='top'&&die===20){
  const base=probe.q.slice(),end=Q.mul(Q.axis(aim.axis,aim.angle),base),up=transformed(end,renderers[20].ups[renderers[20].values.indexOf(value)]),tilt=Math.atan2(up[0],up[1]),turn=tilt-clamp(tilt,-Math.PI*.47,Math.PI*.47);
  for(let i=1;i<=steps;i++){const k=smooth(i/steps);probe.q=normalize(Q.mul(Q.z(turn*k),Q.mul(Q.axis(aim.axis,aim.angle*k),base)));time+=fallDuration/steps;trace.push(traceItem(probe,time));}
 }else for(let i=0;i<steps;i++){travelAngular(probe,aim.axis,aim.angle/steps);time+=fallDuration/steps;trace.push(traceItem(probe,time))}return trace;
}

function rollingBridge(q,value,axis,bend,beta,steps=32){
 let end=q.slice();for(let i=0;i<steps;i++){const u=(i+.5)/steps,a=transformed(Q.axis(GROUND_N,bend*smooth(u)),axis);end=normalize(Q.mul(Q.axis(a,beta/steps),end));}
 const lastAxis=transformed(Q.axis(GROUND_N,bend),axis),n=normalOf(end,value),front=[0,0,1];
 let angle=Math.atan2(vdot(lastAxis,vcross(n,front)),vdot(n,front)-vdot(lastAxis,n)*vdot(lastAxis,front));if(angle<0)angle+=TAU;
 const finalQ=Q.mul(Q.axis(lastAxis,angle),end),up=transformed(finalQ,renderers[die].ups[renderers[die].values.indexOf(value)]);
 return {q:end,axis:lastAxis,angle,error:vdot(lastAxis,vadd(n,[0,0,-1])),up};
}
function bridgeCandidate(m,value,wide=false){
 const speed=Math.hypot(...m.omega);if(speed<1e-7)return null;const axis=normalize(m.omega),aim=surfaceAim(m.q,value);
 let targetAxis=aim.axis,remaining=aim.angle;if(vdot(targetAxis,axis)<0){targetAxis=vmul(targetAxis,-1);remaining=TAU-remaining;}
 if(remaining>(wide?3.2:1.8))return null;
 const heading=Math.atan2(vdot(GROUND_N,vcross(axis,targetAxis)),vdot(axis,targetAxis));if(Math.abs(heading)>(wide?1.4:.9))return null;
 const beta=Math.min(.40,Math.max(.12,remaining*.30));let bend=heading,r;
 for(let i=0;i<9;i++){
  r=rollingBridge(m.q,value,axis,bend,beta);if(Math.abs(r.error)<1e-8)break;
  const d=(rollingBridge(m.q,value,axis,bend+.001,beta).error-rollingBridge(m.q,value,axis,bend-.001,beta).error)/.002;if(Math.abs(d)<1e-5)return null;
  bend-=clamp(r.error/d,-.25,.25);if(Math.abs(bend)>(wide?1.5:1.1))return null;
 }
 r=rollingBridge(m.q,value,axis,bend,beta);
 if(Math.abs(r.error)>1e-6||r.angle>(wide?3.2:1.9)||r.up[1]<.04)return null;
 return {axis,bend,beta,angle:r.angle};
}
function buildRollingBridge(m,value,candidate){
 const probe=copyMotion(m),trace=[traceItem(probe,0)],speed=Math.max(.05,Math.hypot(...m.v)),steps=32;let time=0;
 for(let i=0;i<steps;i++){const u=(i+.5)/steps,axis=transformed(Q.axis(GROUND_N,candidate.bend*smooth(u)),candidate.axis),distance=travelAngular(probe,axis,candidate.beta/steps);time+=distance/speed;trace.push(traceItem(probe,time));}
 const axis=transformed(Q.axis(GROUND_N,candidate.bend),candidate.axis),count=Math.max(1,Math.ceil(candidate.angle/.018));
 for(let i=0;i<count;i++){const distance=travelAngular(probe,axis,candidate.angle/count);time+=distance/speed;trace.push(traceItem(probe,time));}
 return trace;
}
function physicalD10RollTrace(m,value,p){
 const probe=copyMotion(m),trace=[traceItem(probe,0)],dt=1/120,clock=(m.timeRate||1)*p.rotation*(m.spinRate||1),limit=MODES[modeIndex].period*2/Math.max(.05,clock);let t=0,best=null;
 for(let i=0;t<limit;i++){
  if(i%6===0){const candidate=bridgeCandidate(probe,value,false)||bridgeCandidate(probe,value,true);if(candidate){const tail=buildRollingBridge(probe,value,candidate),all=trace.concat(tail.slice(1).map(f=>({...f,t:t+f.t}))),extent=Math.max(...all.map(f=>Math.max(Math.abs(f.x),Math.abs(f.y)*1.3)));
   if(extent<1.65)return all;
   if(!best||extent<best.extent)best={extent,trace:all};
  }}
  motionStep(probe,dt,p);t+=dt;trace.push(traceItem(probe,t));
 }
 if(best)return best.trace;
 return null;
}

function physicalD10TopTrace(m,value,p){
 const probe=copyMotion(m),trace=[traceItem(probe,0)],sign=vdot(m.omega,GROUND_N)<0?-1:1,speed=Math.max(.1,Math.hypot(...m.omega));let time=0;
 const n=normalOf(probe.q,value),front=[0,0,1];let delta=Math.atan2(vdot(GROUND_N,vcross(n,front)),vdot(n,front)-vdot(n,GROUND_N)*vdot(front,GROUND_N));delta=((delta*sign)%TAU+TAU)%TAU;
 const leanSpin=1.8,pre=Math.max(0,delta-leanSpin),steps=Math.max(1,Math.ceil(pre/.025));
 for(let i=0;i<steps;i++){if(pre<1e-8)break;probe.q=Q.mul(Q.axis(GROUND_N,sign*pre/steps),probe.q);time+=pre/steps/speed;trace.push(traceItem(probe,time));}
 const base=probe.q.slice(),spin=Math.max(leanSpin,delta-pre),end=Q.mul(Q.axis(GROUND_N,sign*spin),base),swing=shortestRotation(normalOf(end,value),front),duration=spin*2/speed,count=Math.max(36,Math.ceil(duration*120));
 const landed=Q.mul(swing,end),up=transformed(landed,renderers[10].ups[renderers[10].values.indexOf(value)]);let roll=Math.atan2(up[0],up[1]);if(Math.abs(roll)<.025)roll=0;else roll=sign*(((roll*sign)%TAU+TAU)%TAU);
 for(let i=1;i<=count;i++){const u=i/count,k=smooth(u),phase=spin*(2*u+2*u*u-8*u**3+7*u**4-2*u**5);probe.q=normalize(Q.mul(Q.z(roll*k),Q.mul(Q.pow(swing,k),Q.mul(Q.axis(GROUND_N,sign*phase),base))));time+=duration/count;trace.push(traceItem(probe,time));}
 return trace;
}

function makeStop(){const p=settings(),m=state.motion;let trace;
 if(die===10)trace=inTop(m)?physicalD10TopTrace(m,state.result,p):physicalD10RollTrace(m,state.result,p);
 else if(inTop(m))trace=topStopTrace(m,state.result,p);
 else trace=physicalD10RollTrace(m,state.result,p)||naturalStopTrace(m,state.result,p)||boundedRollTrace(m,state.result,p);
 if(!trace){m.retryAfter=m.t+.3;return;}
 if(trace.length<2||trace.at(-1).t<.005)trace=[traceItem(m,0),traceItem(m,.08)];
 const length=trace.at(-1).t,brake=Math.min(.15,length);state.plan={trace,length,brake,duration:length+brake,elapsed:0};
 if(false&&die!==10&&MODES[modeIndex].id!=='top'){const target=faceQuaternion(state.result),last=trace.at(-1),fix=Q.mul(target,Q.inv(last.q)),angle=2*Math.acos(clamp(Math.abs(fix[3]),0,1)),window=clamp(.28+angle*.11,.28,.63);state.plan.duration=Math.max(state.plan.duration,window);state.plan.presentation={target,fix,endX:last.x,endY:last.y,targetY:(support(target)-BASE_HEIGHT)*GROUND_C,start:Math.max(0,state.plan.duration-window),window};}
 state.phase='stopping';updateStatus();
}
function tracePose(plan){const e=plan.elapsed*(plan.length+plan.brake)/plan.duration,cruise=plan.length-plan.brake;let time=e;if(e>cruise){const u=clamp((e-cruise)/(2*plan.brake));time=cruise+plan.brake*(2*u-u*u)}time=Math.min(plan.length,time);
 const a=plan.trace;let lo=0,hi=a.length-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(a[mid].t<time)lo=mid;else hi=mid}const x=a[lo],y=a[hi],u=clamp((time-x.t)/Math.max(1e-9,y.t-x.t)),m={x:lerp(x.x,y.x,u),y:lerp(x.y,y.y,u),air:lerp(x.air,y.air,u),q:slerp(x.q,y.q,u)};
 if(plan.presentation){const d=plan.presentation,k=smooth((plan.elapsed-d.start)/d.window);m.q=normalize(Q.mul(Q.pow(d.fix,k),m.q));m.x-=d.endX*k;m.y+=(d.targetY-d.endY)*k;}
 return motionPose(m);
}
function getPose(){if(state.phase==='idle')return idlePose();if(state.phase==='stopping'||state.phase==='done')return tracePose(state.plan);return motionPose(state.motion)}
function markStopped(){state.phase='done';if(die===10)return;$('resultNumber').textContent=state.result;$('badge').classList.add('show');updateStatus();window.dispatchEvent(new CustomEvent('grivensburg:dice-settled',{detail:{die,result:state.result,animation:MODES[modeIndex].id}}))}
function advanceSingle(dt){if(!loaded||dt<=0)return;const p=settings(),goal=state.result===null?1:p.completion,old=state.boost??1,decay=Math.exp(-dt/.18),elapsed=goal*dt+(old-goal)*.18*(1-decay);state.boost=goal+(old-goal)*decay;let sim=elapsed*p.tempo;
 while(sim>1e-9){
  if(state.phase==='rolling'){
   if(state.result!==null&&canStop(state.motion)){makeStop();continue}
   const used=Math.min(sim,PHYS_STEP);motionStep(state.motion,used,p);state.t=state.motion.t;sim-=used;
  }else if(state.phase==='stopping'){
   const used=Math.min(sim,state.plan.duration-state.plan.elapsed);state.plan.elapsed+=used;sim-=used;if(state.plan.elapsed>=state.plan.duration-1e-9)markStopped();else break;
  }else break;
 }
}
function advance(dt){
 if(die!==10||!secondState){advanceSingle(dt);return}
 pairBusy=true;try{advanceSingle(dt);withSecond(()=>advanceSingle(dt));}finally{pairBusy=false}
 if(scenePhase()==='done'&&!state.pairAnnounced){state.pairAnnounced=true;const faces=selectedFaces(),total=faces[0]+faces[1];$('resultNumber').textContent=faces.join(' + ')+' = '+total;$('badge').classList.add('show');window.dispatchEvent(new CustomEvent('grivensburg:dice-settled',{detail:{die,count:2,faces,result:total,total,animation:MODES[modeIndex].id}}));}
 updateStatus();
}
function newRollState(second=false){const motion=newMotion();if(second){motion.q=normalize(Q.mul(Q.axis(GROUND_N,.73),motion.q));if(MODES[modeIndex].id!=='top'){motion.heightScale=.88;motion.timeRate=1/Math.sqrt(.88);motion.spinRate=1.045;motion.air*=motion.heightScale;}}return {phase:'rolling',t:0,result:null,motion,plan:null,boost:1}}
function parseResults(value){
 const values=Array.isArray(value)?value.map(Number):String(value).trim().split(/\s+/).map(Number);
 return values.length===(die===10?2:1)&&values.every(n=>Number.isInteger(n)&&n>=1&&n<=die)?values:null;
}
function start(){if(!loaded)return false;state=newRollState();secondState=die===10?newRollState(true):null;$('badge').classList.remove('show');lastTime=performance.now();updateStatus();render();broadcast();return true}
function resolve(value){const values=parseResults(value);if(!values){$('status').textContent=die===10?'Введи два целых числа от 1 до 10 через пробел, например 8 9.':'Нужно целое число от 1 до 20.';$('status').classList.add('error');return false}if(!loaded||(state.result!==null&&!['idle','done'].includes(scenePhase())))return false;if(['idle','done'].includes(scenePhase()))start();
 state.result=values[0];if(die===10)secondState.result=values[1];
 pairBusy=die===10;try{if(canStop(state.motion))makeStop();if(die===10)withSecond(()=>{if(canStop(state.motion))makeStop()});}finally{pairBusy=false}
 $('result').value=values.join(' ');updateStatus();broadcast();return true}

function reset(){secondState=null;state={phase:'idle',t:0,result:null,motion:null,plan:null,boost:1};$('badge').classList.remove('show');updateStatus();render();broadcast()}

function pairPlacement(a,b){
 const amplitude={orbit:.74,sweep:.74,bounce:.62,top:0}[MODES[modeIndex].id],gap=.08,ra=.46*a.scale,rb=.46*b.scale;
 const base=2*amplitude+ra+rb+gap,needed=a.x-b.x+ra+rb+gap,delta=base-needed,separation=(base+needed+Math.sqrt(delta*delta+.0004))/2;
 return [-separation/2,separation/2];
}
    /* ── КОНЕЦ ДОСЛОВНОЙ ЧАСТИ ───────────────────────────────────────── */

    if (opts.prefs) prefs = opts.prefs;

    return {
        MODES: MODES,
        setDie: function (d) { die = d === 10 ? 10 : 20; },
        setMode: function (id) {
            const k = MODES.findIndex(function (m) { return m.id === id; });
            if (k < 0) throw new Error('нет режима ' + id);
            modeIndex = k;
        },
        setFaces: задатьГрани,
        setStage: function (w, h) { сцена = { width: w || 1920, height: h || 1080 }; },
        start: start, resolve: resolve, advance: advance, reset: reset,
        getPose: getPose, phase: scenePhase, faces: selectedFaces,
        pairPlacement: pairPlacement, settings: settings,
        second: function (fn) { return withSecond(fn); },
        /* Только чтение: какой гранью кубик смотрит в камеру. Нужны проверкам
           и контроллеру; тела функций — лабораторные, дословные. */
        visibility: visibility, readablyFront: readablyFront,
        /* Поза «цифра ровно к зрителю и стоит прямо» — цель перелёта в центр
           после остановки. Функция лабораторная, дословная. */
        faceQuaternion: faceQuaternion,
        get state() { return state; },
        get secondState() { return secondState; }
    };
}
root.DicePhysics = { create: createDicePhysics };
})(typeof window !== 'undefined' ? window : globalThis);
