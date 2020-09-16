import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom'
import { Button, Table } from 'react-bootstrap'
import './App.css';


function App() {
  return (
    <div className="App">
      <main className="h-100 w-100">
        <Loading />
      </main>
    </div>
  );
}

function Loading() {
  loadTables();
  const element = (
    <div className="center-main">
      <div>
        <div className="spinner-grow text-light width: 3rem; height: 3rem;" role="status" />
        <p className="text-light">온라인 출석 조회 불러오는 중...</p>
      </div>
      <p className="text-success" id="term">최근 학기 불러오는 중...</p>
    </div>
  )
  return element;
}

async function loadTables() {
  try {
    await UpdateAttendanceTables();
  } catch (err) {
    const errorElement = (
      <div class="alert alert-warning" role="alert">
        {err.message}
      </div>
    )
    ReactDOM.render(errorElement, document.querySelector('main'));
  }
}

async function UpdateAttendanceTables() {
  const userKey = await GetUserKey();
  const coursesData = await GetCourses(userKey);
  const courses = coursesData['courses'];
  let termList = coursesData['termList'];
  // 내림차순 정렬
  termList.sort((a, b) => {
    return Number(b.replace(/[^0-9]/g, "")) - Number(a.replace(/[^0-9]/g, ""));
  })
  const targetTerm = termList[0];
  const targetTermElement = (
    <div class="target-term">
      {targetTerm}
    </div>
  )
  ReactDOM.render(targetTermElement, document.querySelector('#term'));
  const targetCourses = courses.filter(course => course.term === targetTerm);

  let courseTables = []
  for (const course of targetCourses) {
    console.log(`${course['name']} 온라인 출석 조회...`);
    const courseAttendance = await GetCourseAttendance(course['id'], course['name']);
    console.log(courseAttendance);
    courseTables.push(courseAttendance);
  }
  console.log(courseTables);
  const element = (
    <DrawAllTable data={courseTables} />
  );
  document.querySelector('main').classList.remove('h-100');
  ReactDOM.render(element, document.querySelector('main'));
  return userKey;
}

async function GetResponse(url) {
  return await fetch(url, {
    credentials: "same-origin",
    mode: "no-cors"
  });
}

async function GetCourseAttendance(id, name) {
  // LTI 도구 실행에 필요한 form 추출
  let formElement = await (async function () {
    const url = `https://learn.hanyang.ac.kr/webapps/blackboard/execute/blti/launchPlacement?blti_placement_id=_17_1&course_id=${id}&from_ultra=true`;
    const rep = await GetResponse(url);
    const html = await rep.text();
    let parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    return doc.getElementById('bltiLaunchForm');
  })();
  
  const url = formElement.getAttribute('action');
  let data = new URLSearchParams();
  for (const pair of new FormData(formElement)) {
      data.append(pair[0], pair[1]);
  }
  data.append('showAll', 'true');

  const rep = await fetch(url, {
    credentials: "same-origin",
    mode: "no-cors",
    method: "post",
    body: data,
  });
  const html = await rep.text();

  let parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const ele = doc.getElementById("listContainer_databody");
  let courseAttendance = {
    "id": id,
    "name": name,
    "data": []
  }
  if (ele) {
    Array.from(ele.rows).forEach(child => {
      let data = []
      Array.from(child.getElementsByTagName('td')).forEach(td => {
        data.push(td.getElementsByClassName('table-data-cell-value')[0].innerText)
      })
      courseAttendance["data"].push([data[0], data[1], data[6]]);
    })
  }
  return courseAttendance;
}

async function GetCourses(userKey) {
  const url = `https://learn.hanyang.ac.kr/learn/api/v1/users/${userKey}/memberships?expand=course.effectiveAvailability,course.permissions,courseRole&includeCount=true&limit=10000`;
  const rep = await GetResponse(url);
  let result = [];
  let termList = [];
  const json = await rep.json();
  json['results'].forEach(course => {
    course = course['course'];
    const data = {
      'name': course['name'],
      'id': course['id'],
      'courseId': course['courseId'],
      'term': 'term' in course ? course['term']['name'] : null
    }
    if (data['term'] && !termList.includes(data['term'])) {
      termList.push(data['term']);
    }
    result.push(data);
  });
  return {
    "courses": result,
    "termList": termList
  };
}

async function GetUserKey() {
  const url = "https://learn.hanyang.ac.kr/ultra/course";
  const rep = await GetResponse(url);
  const html = await rep.text();
  let idx = html.indexOf('"id":');
  if (idx === -1) {
    console.error(html);
    throw new Error("사용자 ID를 찾을 수 없습니다.");
  }
  idx += 6;
  let key = "";
  while (html[idx] !== '"' && html[idx] !== '?') {
    key += html[idx]
    ++idx
  }
  return key
}

function DrawAllTable(probs) {
  return (
    <div>
      {probs.data.map((course, _) => (
        <AttendanceTable title={course.name} data={course.data} key={course.id}/>
      ))}
    </div>
  );
}

function AttendanceTable(probs) {
  return (
    <div>
      <p className="text-white Table-title">{probs.title}</p>
      <Table responsive="lg" size="sm" variant="dark" bordered>
        <thead>
          <tr>
            <th>위치</th>
            <th>컨텐츠명</th>
            <th>P/F</th>
          </tr>
        </thead>
        <tbody>
          {probs.data.map((row, idx) => (
            <tr key={idx}>
              {row.map((ele, idx) => 
                (<td key={idx} className={row[2]==='F' ? 'text-warning' : 'text-success'}>{ele}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

export default App;
